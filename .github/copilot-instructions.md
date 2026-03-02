# Copilot Instructions for FridgeMate

## Project Overview

FridgeMate is a food management application with a Node.js/Express backend. The app helps users manage their fridges, recipes, and meal planning with AI-powered features.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (access + refresh tokens), Passport.js for Google OAuth
- **Validation**: Zod schemas
- **Testing**: Jest with Supertest
- **Real-time**: Socket.IO
- **API Docs**: Swagger/OpenAPI

## Architecture

The server follows a layered architecture pattern:

```
routes/ → controllers/ → services/ → models/
```

- **Routes**: Define endpoints and apply middleware (auth, validation)
- **Controllers**: Handle HTTP request/response, delegate to services
- **Services**: Business logic, database operations
- **Models**: Mongoose schemas and interfaces

## Coding Conventions

### File Naming

- Use kebab-case for filenames: `auth.controller.ts`, `user.model.ts`
- Suffix files by layer: `.controller.ts`, `.service.ts`, `.model.ts`, `.routes.ts`, `.validators.ts`

### TypeScript

- Define interfaces for all data structures (prefix with `I` for model interfaces: `IUser`, `IFridge`)
- Export types alongside interfaces when needed
- Use strict typing, avoid `any` when possible
- Use `as const` for literal types

### Controllers

- Export as object with async methods
- Use try-catch with `next(err)` for error propagation
- Destructure request body/params at the top
- Return response with status and JSON

```typescript
export const ExampleController = {
  async methodName(req: Request, res: Response, next: NextFunction) {
    try {
      const { param } = req.body;
      const response = await ExampleService.method(param);
      return res.status(response.status).json(response.data);
    } catch (err) {
      next(err);
    }
  },
};
```

### Services

- Export as object with async methods
- Return objects with `{ status: number, data: object }`
- Throw errors for error conditions (caught by controller)
- Handle data transformation and validation

```typescript
export const ExampleService = {
  async method(param: string) {
    const result = await Model.find({ param });
    return { status: 200, data: { items: result } };
  },
};
```

### Models

- Define TypeScript interface before schema
- Use proper Mongoose types (`Schema.Types.ObjectId`)
- Set `select: false` for sensitive fields (password, refreshToken)
- Use `{ timestamps: true }` for automatic createdAt/updatedAt
- Transform `_id` to `id` in `toJSON`

### Validators

- Use Zod for request validation
- Create schemas in `validators/` directory
- Apply via `validate` middleware in routes

```typescript
import { z } from "zod";

export const CreateItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
});
```

## Error Handling

- Use `ApiError` class from `utils/errors.ts` for custom errors
- Include status code, message, and optional code/details
- Errors are caught by `errorHandler` middleware

```typescript
throw new ApiError(404, "Resource not found", "NOT_FOUND");
```

## Authentication

- Use `isAuthorized` middleware for protected routes
- Access user data via `req.user` after authentication
- JWT tokens include: `userId`, `userName`, `email`, `role`, `profileImage`

## Testing

- Test files go in `tests/routes/` or `tests/services/`
- Use Jest with Supertest for integration tests
- Import `app` from `index.ts`
- Use `beforeEach` for test setup and cleanup
- Mock external services when needed

```typescript
import request from "supertest";
import app from "../../index";

describe("Feature Tests", () => {
  it("should do something", async () => {
    const res = await request(app).get("/endpoint");
    expect(res.statusCode).toBe(200);
  });
});
```

## API Response Format

Success responses:
```json
{
  "message": "Success message",
  "data": { }
}
```

Error responses:
```json
{
  "message": "Error description"
}
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `config/` | Database and environment configuration |
| `controllers/` | Request handlers |
| `middlewares/` | Express middleware (auth, validation, errors) |
| `models/` | Mongoose schemas and interfaces |
| `routes/` | API route definitions |
| `services/` | Business logic |
| `socket/` | Socket.IO handlers |
| `tests/` | Jest test files |
| `types/` | TypeScript type extensions |
| `utils/` | Utility functions and classes |
| `validators/` | Zod validation schemas |

## Common Patterns

### Adding a New Feature

1. Create model in `models/` with interface and schema
2. Create validator schemas in `validators/`
3. Create service in `services/` with business logic
4. Create controller in `controllers/`
5. Create routes in `routes/` and register in `routes/index.ts`
6. Add tests in `tests/`

### Protected Routes

```typescript
router.get("/protected", isAuthorized, Controller.method);
```

### Validated Routes

```typescript
router.post("/create", validate(CreateSchema), Controller.create);
```
