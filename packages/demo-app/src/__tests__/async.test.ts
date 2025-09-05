import { expect, test, describe } from '@rstest/core';

// Sample async functions for testing
async function fetchUserData(userId: number): Promise<{ id: number; name: string }> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (userId <= 0) {
    throw new Error('Invalid user ID');
  }
  
  return {
    id: userId,
    name: `User ${userId}`
  };
}

function processData(data: string[]): string[] {
  return data.map(item => item.toUpperCase());
}

describe('Async operations', () => {
  test('should fetch user data successfully', async () => {
    const userData = await fetchUserData(1);
    
    expect(userData).toEqual({
      id: 1,
      name: 'User 1'
    });
  });

  test('should handle invalid user IDs', async () => {
    await expect(fetchUserData(-1)).rejects.toThrow('Invalid user ID');
    await expect(fetchUserData(0)).rejects.toThrow('Invalid user ID');
  });

  test('should process data array correctly', () => {
    const input = ['hello', 'world', 'rstest'];
    const result = processData(input);
    
    expect(result).toEqual(['HELLO', 'WORLD', 'RSTEST']);
  });

  test('should handle empty arrays', () => {
    const result = processData([]);
    expect(result).toEqual([]);
  });
});