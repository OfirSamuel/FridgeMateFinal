import request from 'supertest';
import { token, userId, refreshToken } from '../setup';
import { FridgeModel } from '../../models/fridge.model';
import InventoryItem from '../../models/inventory-item.model';
import mongoose from 'mongoose';
import User from '../../models/user.model';
import jwt from 'jsonwebtoken';

// 1. Mock the AI Service
const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => {
    return {
        GoogleGenAI: jest.fn().mockImplementation(() => ({
            models: {
                generateContent: mockGenerateContent
            }
        }))
    };
});

// 2. Import app
let app: any;

describe('Fridge Join AI Trigger', () => {
    let fridgeId: string;
    let inviteCode: string;
    let secondUserId = new mongoose.Types.ObjectId();
    let secondUserToken: string;

    beforeAll(() => {
        app = require('../../index').default;
        secondUserToken = `Bearer ${jwt.sign({ userId: secondUserId }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await FridgeModel.deleteMany({});
        await InventoryItem.deleteMany({});
        await User.deleteMany({});

        // Create primary user
        await User.create({
            _id: userId,
            userName: 'user1',
            displayName: 'User One',
            email: 'user1@example.com',
            password: 'password'
        });

        // Create secondary user
        await User.create({
            _id: secondUserId,
            userName: 'user2',
            displayName: 'User Two',
            email: 'user2@example.com',
            password: 'password'
        });

        // Create fridge for user 1
        const fridge = await FridgeModel.create({
            name: 'Join Test Fridge',
            inviteCode: 'JOIN123',
            members: [{ userId: userId, joinedAt: new Date() }]
        });
        fridgeId = fridge._id.toString();
        inviteCode = fridge.inviteCode;
    });

    it('should re-evaluate shared items when a new user joins', async () => {
        // 1. Add item "Eggs" (Quantity: 6) - AI says NOT low for 1 person
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({
                isRunningLow: false,
                reasoning: "6 eggs is fine for 1 person."
            })
        });

        const itemRes = await request(app)
            .post(`/fridges/${fridgeId}/items`)
            .set('Authorization', token)
            .send({
                name: "Eggs",
                quantity: "6 pcs",
                ownership: "SHARED"
            });
        
        expect(itemRes.statusCode).toBe(201);
        const itemId = itemRes.body.data._id || itemRes.body.data.id;
        expect(itemRes.body.data.isRunningLow).toBe(false);

        // 2. User 2 joins the fridge.
        // We expect the background job to trigger AI check.
        // AI should now say LOW for 2 people (6 eggs / 2 people = 3 each, maybe low?)
        // The service calls checkMultipleItemsIfRunningLow which returns an array
        
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify([
                { id: itemId, isRunningLow: true }
            ])
        });

        const joinRes = await request(app)
            .post('/fridges/join')
            .set('Authorization', secondUserToken)
            .send({ inviteCode });

        expect(joinRes.statusCode).toBe(200);

        // Wait a bit for the async operation (it's not awaited in the controller)
        // Since we are mocking, the promise resolves immediately, but we need the event loop to turn.
        await new Promise(resolve => setTimeout(resolve, 100));

        // 3. Verify item is updated in DB
        const updatedItem = await InventoryItem.findById(itemId);
        expect(updatedItem).not.toBeNull();
        expect(updatedItem?.isRunningLow).toBe(true);

        // 4. Verify AI was called with correct context (2 people)
        // The first call was for creation (single item check)
        // The second call is the batch check
        const batchCall = mockGenerateContent.mock.calls[1][0];
        expect(batchCall.contents).toContain("Household Size: 2");
        expect(batchCall.contents).toContain(`ID: ${itemId}`);
    });

    it('should NOT update private items when a new user joins', async () => {
         // 1. Add PRIVATE item "My Snack" - AI says NOT low
         mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({
                isRunningLow: false
            })
        });

        const itemRes = await request(app)
            .post(`/fridges/${fridgeId}/items`)
            .set('Authorization', token)
            .send({
                name: "My Snack",
                quantity: "1 bar",
                ownership: "PRIVATE"
            });
        
        const itemId = itemRes.body.data._id || itemRes.body.data.id;

        // 2. User 2 joins
        // The service should filter for SHARED items only, so AI shouldn't be called for this PRIVATE item.
        // However, if we have NO shared items, verify it doesn't call AI for batch.
        
        mockGenerateContent.mockClear(); // Clear creation call

        const joinRes = await request(app)
            .post('/fridges/join')
            .set('Authorization', secondUserToken)
            .send({ inviteCode });

        expect(joinRes.statusCode).toBe(200);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Expect NO AI call since no shared items exist
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });
});
