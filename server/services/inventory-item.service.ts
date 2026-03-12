import mongoose from "mongoose";
import { ApiError } from "../utils/errors";
import { InventoryItemModel } from "../models/inventory-item.model";
import { FridgeModel } from "../models/fridge.model";
import {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  InventoryItemQuery,
} from "../validators/inventory-item.validators";

export class InventoryItemService {
  /**
   * Verify user is a member of the fridge
   */
  private static async verifyFridgeMembership(
    fridgeId: string,
    userId: string
  ): Promise<void> {
    const fridge = await FridgeModel.findById(fridgeId);
    if (!fridge) {
      throw new ApiError(404, "Fridge not found", "FRIDGE_NOT_FOUND");
    }

    const isMember = fridge.members.some(
      (m) => m.userId.toString() === userId
    );
    if (!isMember) {
      throw new ApiError(403, "Not a member of this fridge", "FORBIDDEN");
    }
  }

  /**
   * Create a new inventory item
   */
  static async create(
    fridgeId: string,
    userId: string,
    data: Omit<CreateInventoryItemInput, "fridgeId">
  ) {
    await this.verifyFridgeMembership(fridgeId, userId);

    const item = await InventoryItemModel.create({
      fridgeId: new mongoose.Types.ObjectId(fridgeId),
      ownerId: new mongoose.Types.ObjectId(userId),
      name: data.name,
      quantity: data.quantity,
      ownership: data.ownership ?? "PRIVATE",
    });

    return item.toObject();
  }

  /**
   * Get all items in a fridge (respecting visibility rules)
   * - SHARED items visible to all members
   * - PRIVATE items visible only to owner
   */
  static async getAll(
    fridgeId: string,
    userId: string,
    query: InventoryItemQuery,
    pagination: { skip: number; limit: number }
  ) {
    await this.verifyFridgeMembership(fridgeId, userId);

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const fridgeObjectId = new mongoose.Types.ObjectId(fridgeId);

    // Build query: SHARED items OR user's PRIVATE items
    const filter: any = {
      fridgeId: fridgeObjectId,
      $or: [
        { ownership: "SHARED" },
        { ownership: "PRIVATE", ownerId: userObjectId },
      ],
    };

    // Apply ownership filter if specified
    if (query.ownership) {
      delete filter.$or;
      if (query.ownership === "PRIVATE") {
        // Only show user's own private items
        filter.ownership = "PRIVATE";
        filter.ownerId = userObjectId;
      } else {
        // Show all shared items
        filter.ownership = "SHARED";
      }
    }

    const [items, total] = await Promise.all([
      InventoryItemModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      InventoryItemModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  /**
   * Get a single item by ID
   */
  static async getById(itemId: string, userId: string) {
    const item = await InventoryItemModel.findById(itemId);
    if (!item) {
      throw new ApiError(404, "Item not found", "ITEM_NOT_FOUND");
    }

    // Verify user is a member of the fridge
    await this.verifyFridgeMembership(item.fridgeId.toString(), userId);

    // Check visibility: PRIVATE items only visible to owner
    if (
      item.ownership === "PRIVATE" &&
      item.ownerId.toString() !== userId
    ) {
      throw new ApiError(403, "Not allowed to view this item", "FORBIDDEN");
    }

    return item.toObject();
  }

  /**
   * Update an item (only owner can update)
   */
  static async update(
    itemId: string,
    userId: string,
    data: UpdateInventoryItemInput
  ) {
    const item = await InventoryItemModel.findById(itemId);
    if (!item) {
      throw new ApiError(404, "Item not found", "ITEM_NOT_FOUND");
    }

    // Only owner can update
    if (item.ownerId.toString() !== userId) {
      throw new ApiError(403, "Only item owner can update", "FORBIDDEN");
    }

    // Apply updates
    if (data.name !== undefined) item.name = data.name;
    if (data.quantity !== undefined) item.quantity = data.quantity;
    if (data.ownership !== undefined) item.ownership = data.ownership;

    await item.save();
    return item.toObject();
  }

  /**
   * Delete an item (only owner can delete)
   */
  static async delete(itemId: string, userId: string) {
    const item = await InventoryItemModel.findById(itemId);
    if (!item) {
      throw new ApiError(404, "Item not found", "ITEM_NOT_FOUND");
    }

    // Only owner can delete
    if (item.ownerId.toString() !== userId) {
      throw new ApiError(403, "Only item owner can delete", "FORBIDDEN");
    }

    await item.deleteOne();
    return { ok: true };
  }
}
