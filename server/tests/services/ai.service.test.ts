// Mock the Google GenAI SDK before importing the service
const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: {
            generateContent: mockGenerateContent
        }
    }))
}));

// Import after mocking
import { AIService } from '../../services/ai.service';

describe('AIService Tests', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('generateRecipes', () => {
        const mockRecipeResponse = {
            text: JSON.stringify([
                {
                    title: "Scrambled Eggs",
                    description: "Simple scrambled eggs",
                    cookingTime: "10 minutes",
                    difficulty: "Easy",
                    ingredients: [{ name: "eggs", amount: "3" }],
                    steps: ["Crack eggs", "Cook"],
                    nutrition: { calories: "200 kcal" }
                },
                {
                    title: "Cheese Toast",
                    description: "Toasted bread with cheese",
                    cookingTime: "5 minutes",
                    difficulty: "Easy",
                    ingredients: [{ name: "bread", amount: "2 slices" }],
                    steps: ["Toast bread", "Add cheese"],
                    nutrition: { calories: "250 kcal" }
                }
            ])
        };

        it('should generate recipes from ingredients', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockRecipeResponse);

            const result = await AIService.generateRecipes({
                ingredients: ['eggs', 'bread', 'cheese'],
                count: 2
            });

            expect(result.recipes).toHaveLength(2);
            expect(result.recipes[0].title).toBe('Scrambled Eggs');
            expect(result.recipes[1].title).toBe('Cheese Toast');
        });

        it('should include allergies in the prompt', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockRecipeResponse);

            await AIService.generateRecipes({
                ingredients: ['eggs'],
                allergies: ['peanuts', 'shellfish']
            });

            const callArgs = mockGenerateContent.mock.calls[0];
            const requestBody = callArgs[0] as any;
            const prompt = requestBody.contents;
            
            expect(prompt).toContain('peanuts');
            expect(prompt).toContain('shellfish');
            expect(prompt).toContain('NEVER include');
        });

        it('should include diet preference in the prompt', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockRecipeResponse);

            await AIService.generateRecipes({
                ingredients: ['eggs'],
                dietPreference: 'VEGAN'
            });

            const callArgs = mockGenerateContent.mock.calls[0];
            const requestBody = callArgs[0] as any;
            const prompt = requestBody.contents;
            
            expect(prompt).toContain('VEGAN');
            expect(prompt).toContain('vegan recipes');
        });

        it('should handle rate limit error', async () => {
            mockGenerateContent.mockRejectedValueOnce(
                new Error('Error 429: quota exceeded')
            );

            await expect(AIService.generateRecipes({
                ingredients: ['eggs']
            })).rejects.toThrow('rate limit exceeded');
        });

        it('should handle empty AI response', async () => {
            mockGenerateContent.mockResolvedValueOnce({
                text: ''
            });

            await expect(AIService.generateRecipes({
                ingredients: ['eggs']
            })).rejects.toThrow('No response from AI');
        });

        it('should handle markdown code blocks in response', async () => {
            const responseWithMarkdown = {
                text: '```json\n[{"title": "Test", "description": "Test", "cookingTime": "10 min", "difficulty": "Easy", "ingredients": [], "steps": []}]\n```'
            };
            mockGenerateContent.mockResolvedValueOnce(responseWithMarkdown);

            const result = await AIService.generateRecipes({
                ingredients: ['eggs']
            });

            expect(result.recipes).toHaveLength(1);
            expect(result.recipes[0].title).toBe('Test');
        });

        it('should use default count of 3', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockRecipeResponse);

            await AIService.generateRecipes({
                ingredients: ['eggs']
            });

            const callArgs = mockGenerateContent.mock.calls[0];
            const requestBody = callArgs[0] as any;
            const prompt = requestBody.contents;
            
            expect(prompt).toContain('exactly 3 recipes');
        });

        it('should handle malformed JSON response', async () => {
            mockGenerateContent.mockResolvedValueOnce({
                text: 'This is not valid JSON'
            });

            await expect(AIService.generateRecipes({
                ingredients: ['eggs']
            })).rejects.toThrow('Failed to parse recipe response from AI');
        });
    });

    describe('askAboutRecipe', () => {
        const mockAskResponse = {
            text: "With eggs and cheese, you can make an omelette!"
        };

        it('should answer a cooking question', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockAskResponse);

            const result = await AIService.askAboutRecipe(
                'What can I make?',
                undefined,
                ['eggs', 'cheese']
            );

            expect(result).toContain('omelette');
        });

        it('should include recipe context in prompt', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockAskResponse);

            await AIService.askAboutRecipe(
                'Can I make this vegan?',
                { 
                    title: 'Cheese Omelette',
                    ingredients: [{ name: 'eggs', amount: '3' }, { name: 'cheese', amount: '100g' }],
                    steps: ['Beat eggs', 'Cook in pan']
                }
            );

            const callArgs = mockGenerateContent.mock.calls[0];
            const requestBody = callArgs[0] as any;
            const prompt = requestBody.contents;
            
            expect(prompt).toContain('Cheese Omelette');
            expect(prompt).toContain('eggs');
            expect(prompt).toContain('cheese');
        });

        it('should include available ingredients in prompt', async () => {
            mockGenerateContent.mockResolvedValueOnce(mockAskResponse);

            await AIService.askAboutRecipe(
                'What can I cook?',
                undefined,
                ['eggs', 'milk', 'flour']
            );

            const callArgs = mockGenerateContent.mock.calls[0];
            const requestBody = callArgs[0] as any;
            const prompt = requestBody.contents;
            
            expect(prompt).toContain('eggs');
            expect(prompt).toContain('milk');
            expect(prompt).toContain('flour');
        });

        it('should handle rate limit error', async () => {
            mockGenerateContent.mockRejectedValueOnce(
                new Error('429: rate limit')
            );

            await expect(AIService.askAboutRecipe(
                'What can I make?',
                undefined,
                ['eggs']
            )).rejects.toThrow('rate limit exceeded');
        });

        it('should return fallback message on empty response', async () => {
            mockGenerateContent.mockResolvedValueOnce({
                text: ''
            });

            const result = await AIService.askAboutRecipe(
                'What can I make?',
                undefined,
                ['eggs']
            );

            expect(result).toBe('Unable to process your request.');
        });

        it('should handle general API error', async () => {
            mockGenerateContent.mockRejectedValueOnce(new Error('Network failure'));

            await expect(AIService.askAboutRecipe(
                'What can I make?',
                undefined,
                ['eggs']
            )).rejects.toThrow('AI service error');
        });
    });
});
