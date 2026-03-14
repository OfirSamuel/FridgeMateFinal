import request from 'supertest';
import { token, userId } from '../setup';
import { FridgeModel } from '../../models/fridge.model';
// InventoryItem is exported as default InventoryItemModel
import InventoryItem from '../../models/inventory-item.model';

// 1. Mock the AI Service before importing app
const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: {
            generateContent: mockGenerateContent
        }
    }))
}));

// 2. Import app
const app = require('../../index').default;

describe('Inventory AI Integration', () => {
    let fridgeId: string;

    beforeEach(async () => {
        jest.clearAllMocks();
        // Clear collections to ensure a clean slate
        await FridgeModel.deleteMany({});
        await InventoryItem.deleteMany({});

        // Create a test fridge
        const fridge = await FridgeModel.create({
            name: 'AI Test Fridge',
            inviteCode: 'AITEST',
            members: [{ userId: userId, joinedAt: new Date() }]
        });
        fridgeId = fridge._id.toString();
    });

    it('should set isRunningLow=true when AI determines low stock', async () => {
        // Mock AI response for "Running Low"
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({
                isRunningLow: true,
                reasoning: "1 drop is not enough for any household."
            })
        });

        const res = await request(app)
            .post(`/fridges/${fridgeId}/items`)
            .set('Authorization', token)
            .send({
                name: 'Milk',
                quantity: '1 drop',
                ownership: 'SHARED'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.data.name).toBe('Milk');
        expect(res.body.data.isRunningLow).toBe(true);
        expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should set isRunningLow=false when AI determines sufficient stock', async () => {
        // Mock AI response for "Sufficient Stock"
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({
                isRunningLow: false,
                reasoning: "10 liters is plenty."
            })
        });

        const res = await request(app)
            .post(`/fridges/${fridgeId}/items`)
            .set('Authorization', token)
            .send({
                name: 'Milk',
                quantity: '10 liters',
                ownership: 'SHARED'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.data.isRunningLow).toBe(false);
    });

    it('should update isRunningLow when quantity changes', async () => {
        // 1. Create item (AI says not low initially)
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({ isRunningLow: false })
        });

        const createRes = await request(app)
            .post(`/fridges/${fridgeId}/items`)
            .set('Authorization', token)
            .send({ name: 'Milk', quantity: '1 gallon', ownership: 'SHARED' });
        
        expect(createRes.statusCode).toBe(201);
        // Service returns item.toObject(), so we check _id
        const itemId = createRes.body.data._id || createRes.body.data.id;

        // 2. Update quantity to low (AI says low now)
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({ isRunningLow: true, reasoning: "Drops are low." })
        });

        const updateRes = await request(app)
            .patch(`/fridges/${fridgeId}/items/${itemId}`)
            .set('Authorization', token)
            .send({ quantity: '2 drops' });

        expect(updateRes.statusCode).toBe(200);
        expect(updateRes.body.data.name).toBe('Milk');
        expect(updateRes.body.data.quantity).toBe('2 drops');
        expect(updateRes.body.data.isRunningLow).toBe(true);
    });
});
