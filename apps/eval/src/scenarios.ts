/** Simulated app builds the shadow harness runs the golden prompts across. */
import type { BuildScenario } from "./types.js";

/**
 * 12 builds spanning categories/markets. The first is the ticket's canonical example
 * ("Build a meditation app for UK adults"). Each is a unit the north-star normalises against.
 */
export const SCENARIOS: BuildScenario[] = [
  { id: "meditation-uk", idea: "a meditation app for UK adults", category: "Health & Fitness", country: "GB", store: "apple", seedKeyword: "meditation" },
  { id: "budget-us", idea: "a personal budgeting app", category: "Finance", country: "US", store: "apple", seedKeyword: "budget" },
  { id: "habit-us", idea: "a habit tracker", category: "Productivity", country: "US", store: "apple", seedKeyword: "habit tracker" },
  { id: "language-de", idea: "a language-learning app for commuters", category: "Education", country: "DE", store: "apple", seedKeyword: "learn language" },
  { id: "recipe-us", idea: "a meal-planning and recipe app", category: "Food & Drink", country: "US", store: "apple", seedKeyword: "meal plan" },
  { id: "sleep-uk", idea: "a sleep and white-noise app", category: "Health & Fitness", country: "GB", store: "apple", seedKeyword: "sleep sounds" },
  { id: "journal-us", idea: "a daily journaling app", category: "Lifestyle", country: "US", store: "apple", seedKeyword: "journal" },
  { id: "workout-au", idea: "a home workout app", category: "Health & Fitness", country: "AU", store: "apple", seedKeyword: "home workout" },
  { id: "focus-us", idea: "a focus and pomodoro timer", category: "Productivity", country: "US", store: "apple", seedKeyword: "focus timer" },
  { id: "expense-ca", idea: "a shared-expenses app for housemates", category: "Finance", country: "CA", store: "apple", seedKeyword: "split expenses" },
  { id: "plant-us", idea: "a plant-care reminder app", category: "Lifestyle", country: "US", store: "apple", seedKeyword: "plant care" },
  { id: "study-us", idea: "a flashcards and study app", category: "Education", country: "US", store: "apple", seedKeyword: "flashcards" },
];
