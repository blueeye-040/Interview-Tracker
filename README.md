# LeetCode Problem Tracker

A structured JSON-based tracker to organize and monitor your LeetCode problem-solving journey, categorized by topic (Array & String, Dynamic Programming, Linked List, Binary Tree, Graph, Two Pointers, Stack).

## Features

- Problem details stored by category.
- Tracks:
  - Problem title and link.
  - Difficulty level.
  - Time and space complexity.
  - Tags/techniques used.
  - Attempts count (auto-resettable).
  - Last solved date (auto-resettable).
  - Notes (custom, optional, auto-clearable).
- JSON structured for easy updates and parsing.
- Goals section for daily, weekly, and target completion tracking.

## File Structure

- **problems.json** – Contains all LeetCode problems structured by category.
- Each problem includes:
  - `title`: Name of the problem.
  - `link`: Direct link to the LeetCode problem.
  - `difficulty`: Easy, Medium, or Hard.
  - `solution`: (Can be filled manually or kept empty as per progress.)
  - `timeComplexity` & `spaceComplexity`: For performance reference.
  - `tags`: Related techniques/topics.
  - `attempts`: Number of attempts (reset to 0 after clearing).
  - `lastSolved`: Date last solved (reset to empty after clearing).
  - `notes`: Additional notes (reset to empty after clearing).
  - `dateAdded`: When the problem was added to your tracker.

## How to Use

1. **Update the JSON manually** as you solve problems.
2. Use `attempts`, `lastSolved`, and `notes` to track your personal progress.
3. Solutions can be filled in directly or linked externally.
4. Reset values periodically for fresh practice sessions.

## Example Snippet

```json
{
    "version": "2.0",
    "exportDate": "2024-01-20T10:30:00.000Z",
    "problems": {
      "Array & String": [
        {
          "title": "Two Sum",
          "link": "https://leetcode.com/problems/two-sum/",
          "difficulty": "Easy",
          "solution": "",
          "timeComplexity": "O(n)",
          "spaceComplexity": "O(n)",
          "tags": ["Hash Map", "Array"],
          "attempts": 0,
          "lastSolved": "",
          "notes": "",
          "dateAdded": "2024-01-15T08:00:00.000Z"
        }
      ]
      "goals": {
      "daily": 2,
      "weekly": 10,
      "targetDate": "2024-06-01"
    }
    }
}

