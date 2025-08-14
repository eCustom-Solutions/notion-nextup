#!/usr/bin/env ts-node

/**
 * Test suite for intraday completion date calculation
 * Tests the logic for calculating projected completion times with intraday precision
 * 
 * Workday: 8:00 AM - 4:00 PM (8 hours)
 * Partial days are calculated as hours: estimatedDays * 8 hours
 */

interface TestCase {
  name: string;
  startDate: Date;
  estimatedDays: number;
  expectedCompletion: Date;
  description: string;
}

/**
 * Calculate projected completion date with intraday precision (SIMPLE & CORRECT VERSION)
 * @param startDate - When the task starts
 * @param estimatedDays - Estimated effort in days (can be decimal)
 * @param workdayStart - Workday start hour (default: 8)
 * @param workdayEnd - Workday end hour (default: 16)
 * @returns Projected completion date and time
 */
function calculateIntradayCompletionSimple(
  startDate: Date,
  estimatedDays: number,
  workdayStart: number = 8,
  workdayEnd: number = 16
): Date {
  const workdayHours = workdayEnd - workdayStart;
  let remainingHours = estimatedDays * workdayHours;

  // Start from a safe clone
  let current = new Date(startDate);

  // Helper to advance to next business day at start time
  const advanceToNextBusinessStart = () => {
    current.setDate(current.getDate() + 1);
    current.setHours(workdayStart, 0, 0, 0);
    while (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
    }
  };

  // Normalize start within work hours
  const startHour = current.getHours() + current.getMinutes() / 60;
  if (current.getDay() === 0 || current.getDay() === 6) {
    // Weekend → move to next business start
    while (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
    }
    current.setHours(workdayStart, 0, 0, 0);
  } else if (startHour < workdayStart) {
    current.setHours(workdayStart, 0, 0, 0);
  } else if (startHour >= workdayEnd) {
    current.setHours(workdayStart, 0, 0, 0);
    advanceToNextBusinessStart();
  }

  let lastSegmentStartedAtDayStart = false;
  let lastSegmentEndedToday = false;

  while (remainingHours > 0) {
    // Ensure we are within a business day window
    if (current.getDay() === 0 || current.getDay() === 6) {
      // weekend
      while (current.getDay() === 0 || current.getDay() === 6) {
        current.setDate(current.getDate() + 1);
      }
      current.setHours(workdayStart, 0, 0, 0);
    }

    const nowHour = current.getHours() + current.getMinutes() / 60;
    if (nowHour < workdayStart) {
      current.setHours(workdayStart, 0, 0, 0);
    }
    if (nowHour >= workdayEnd) {
      advanceToNextBusinessStart();
      continue;
    }

    const availableToday = workdayEnd - (current.getHours() + current.getMinutes() / 60);

    if (remainingHours <= availableToday + 1e-9) {
      // Fit within today
      const beforeHour = current.getHours() + current.getMinutes() / 60;
      const millis = remainingHours * 60 * 60 * 1000;
      current = new Date(current.getTime() + millis);
      const afterHour = current.getHours() + current.getMinutes() / 60;

      const startedAtDayStart = Math.abs(beforeHour - workdayStart) < 1e-9;
      lastSegmentStartedAtDayStart = startedAtDayStart;
      lastSegmentEndedToday = true;

      // Boundary policy: if finish exactly at workday end and we did not start at day start,
      // roll to next business day 08:00 (no remainder)
      const finishedAtDayEnd = Math.abs(afterHour - workdayEnd) < 1e-9;
      if (finishedAtDayEnd && !startedAtDayStart) {
        advanceToNextBusinessStart();
      }

      remainingHours = 0;
      break;
    } else {
      // Fill today to end and continue
      const millis = availableToday * 60 * 60 * 1000;
      current = new Date(current.getTime() + millis);
      remainingHours -= availableToday;
      // Move to next business day start
      advanceToNextBusinessStart();
    }
  }

  // Round up to the nearest minute
  if (current.getSeconds() > 0 || current.getMilliseconds() > 0) {
    current = new Date(current.getTime() + (60 * 1000 - (current.getSeconds() * 1000 + current.getMilliseconds())));
  }
  current.setSeconds(0, 0);

  // Post-rounding boundary guard
  const hour = current.getHours();
  const minute = current.getMinutes();
  if (lastSegmentEndedToday && !lastSegmentStartedAtDayStart && (hour > workdayEnd || (hour === workdayEnd && minute >= 0))) {
    advanceToNextBusinessStart();
  }

  return current;
}

/**
 * Helper to create a date at specific time
 */
function createDate(year: number, month: number, day: number, hour: number, minute: number = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Format date for readable output
 */
function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Test cases covering various scenarios
 */
const testCases: TestCase[] = [
  // Same day completions
  {
    name: "Small task early in day",
    startDate: createDate(2025, 8, 14, 9, 0), // Thu 9:00 AM
    estimatedDays: 0.1,
    expectedCompletion: createDate(2025, 8, 14, 9, 48), // Thu 9:48 AM
    description: "0.1 days = 48 minutes, completes same day"
  },
  {
    name: "Half day task starting morning",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 0.5,
    expectedCompletion: createDate(2025, 8, 14, 12, 0), // Thu 12:00 PM
    description: "0.5 days = 4 hours, completes same day at noon"
  },
  {
    name: "Full day task starting morning",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 1.0,
    expectedCompletion: createDate(2025, 8, 14, 16, 0), // Thu 4:00 PM
    description: "1.0 days = 8 hours, completes same day at 4 PM"
  },
  
  // Cross-day completions
  {
    name: "Task starting late morning, overflows to next day",
    startDate: createDate(2025, 8, 14, 10, 0), // Thu 10:00 AM
    estimatedDays: 0.75,
    expectedCompletion: createDate(2025, 8, 15, 8, 0), // Fri 8:00 AM (roll at boundary)
    description: "0.75 days = 6 hours, boundary at 4 PM rolls to next day start"
  },
  {
    name: "Task starting afternoon, overflows to next day",
    startDate: createDate(2025, 8, 14, 14, 0), // Thu 2:00 PM
    estimatedDays: 0.5,
    expectedCompletion: createDate(2025, 8, 15, 10, 0), // Fri 10:00 AM (carry remainder)
    description: "0.5 days = 4 hours; carry 2 hours into next day"
  },
  {
    name: "Task starting late afternoon, overflows to next day",
    startDate: createDate(2025, 8, 14, 15, 30), // Thu 3:30 PM
    estimatedDays: 0.1,
    expectedCompletion: createDate(2025, 8, 15, 8, 18), // Fri 8:18 AM
    description: "0.1 days = 48 minutes, 3:30 PM + 48 min = 4:18 PM, moves to next day"
  },
  
  // Multi-day tasks
  {
    name: "1.5 day task starting morning",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 1.5,
    expectedCompletion: createDate(2025, 8, 15, 12, 0), // Fri 12:00 PM
    description: "1.5 days = 12 hours, completes Thu 4 PM + Fri 4 hours = Fri noon"
  },
  {
    name: "2.25 day task starting morning",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 2.25,
    expectedCompletion: createDate(2025, 8, 18, 10, 0), // Mon 10:00 AM (weekend skipped)
    description: "2.25 days = 18 hours; skip weekend to Monday"
  },
  
  // Weekend handling
  {
    name: "Task starting Friday afternoon, overflows to Monday",
    startDate: createDate(2025, 8, 15, 14, 0), // Fri 2:00 PM
    estimatedDays: 0.5,
    expectedCompletion: createDate(2025, 8, 18, 10, 0), // Mon 10:00 AM (carry remainder)
    description: "0.5 days = 4 hours; carry 2 hours into Monday"
  },
  {
    name: "Task starting Friday morning, overflows to Monday",
    startDate: createDate(2025, 8, 15, 10, 0), // Fri 10:00 AM
    estimatedDays: 1.0,
    expectedCompletion: createDate(2025, 8, 18, 10, 0), // Mon 10:00 AM
    description: "1.0 days = 8 hours, Fri 10 AM + 8 hours = 6 PM, skips weekend to Mon"
  },
  
  // Edge cases
  {
    name: "Tiny task (0.01 days)",
    startDate: createDate(2025, 8, 14, 9, 0), // Thu 9:00 AM
    estimatedDays: 0.01,
    expectedCompletion: createDate(2025, 8, 14, 9, 5), // Thu 9:05 AM (round up)
    description: "0.01 days = 4.8 minutes, rounds up to next minute"
  },
  {
    name: "Very small task (0.05 days)",
    startDate: createDate(2025, 8, 14, 15, 0), // Thu 3:00 PM
    estimatedDays: 0.05,
    expectedCompletion: createDate(2025, 8, 14, 15, 24), // Thu 3:24 PM
    description: "0.05 days = 24 minutes, completes same day"
  },
  {
    name: "Large task (5.75 days)",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 5.75,
    expectedCompletion: createDate(2025, 8, 22, 14, 0), // Fri 2:00 PM
    description: "5.75 days = 46 hours, 5 full days + Thu 8 AM + Fri 6 hours = Fri 2 PM"
  },
  
  // Boundary conditions
  {
    name: "Task exactly at workday boundary",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 1.0,
    expectedCompletion: createDate(2025, 8, 14, 16, 0), // Thu 4:00 PM
    description: "1.0 days = 8 hours, exactly at workday end (4 PM)"
  },
  {
    name: "Task just over workday boundary",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 1.01,
    expectedCompletion: createDate(2025, 8, 15, 8, 5), // Fri 8:05 AM
    description: "1.01 days = 8.08 hours, just over boundary, moves to next day"
  },
  {
    name: "Task starting at workday end",
    startDate: createDate(2025, 8, 14, 16, 0), // Thu 4:00 PM
    estimatedDays: 0.1,
    expectedCompletion: createDate(2025, 8, 15, 8, 48), // Fri 8:48 AM
    description: "Starting at 4 PM, 0.1 days = 48 minutes, moves to next day"
  },
  {
    name: "Task starting Friday late afternoon, overflows across weekend",
    startDate: createDate(2025, 8, 15, 15, 30), // Fri 3:30 PM
    estimatedDays: 0.1,
    expectedCompletion: createDate(2025, 8, 18, 8, 18), // Mon 8:18 AM
    description: "Friday 3:30 PM + 48 min crosses weekend → Monday 8:18 AM"
  },
  {
    name: "Task starting on Saturday morning",
    startDate: createDate(2025, 8, 16, 9, 0), // Sat 9:00 AM
    estimatedDays: 0.25, // 2 hours
    expectedCompletion: createDate(2025, 8, 18, 10, 0), // Mon 10:00 AM
    description: "Weekend start normalizes to Monday 8:00 + 2h = 10:00 AM"
  },
  {
    name: "Task starting on Sunday afternoon",
    startDate: createDate(2025, 8, 17, 15, 0), // Sun 3:00 PM
    estimatedDays: 0.05, // 24 minutes
    expectedCompletion: createDate(2025, 8, 18, 8, 24), // Mon 8:24 AM
    description: "Weekend start moves to Monday 8:00 + 24 min"
  },
  {
    name: "Task starting Friday at 4:00 PM with 1 day",
    startDate: createDate(2025, 8, 15, 16, 0), // Fri 4:00 PM
    estimatedDays: 1.0,
    expectedCompletion: createDate(2025, 8, 18, 16, 0), // Mon 4:00 PM
    description: "Start at day end → next business start, full 8h on Monday"
  },
  {
    name: "Task starting before workday begins",
    startDate: createDate(2025, 8, 14, 7, 30), // Thu 7:30 AM
    estimatedDays: 0.25, // 2 hours
    expectedCompletion: createDate(2025, 8, 14, 10, 0), // Thu 10:00 AM
    description: "Normalize to 8:00, then +2h"
  },
  {
    name: "Task starting 1 minute before end with 0.02 days",
    startDate: createDate(2025, 8, 14, 15, 59), // Thu 3:59 PM
    estimatedDays: 0.02, // 9.6 minutes
    expectedCompletion: createDate(2025, 8, 15, 8, 10), // Fri 8:10 AM
    description: "1 min today + 8.6 min next day (rounded up)"
  },
  {
    name: "Task starting 1 minute before end with 0.001 days",
    startDate: createDate(2025, 8, 14, 15, 59), // Thu 3:59 PM
    estimatedDays: 0.001, // 0.48 minutes
    expectedCompletion: createDate(2025, 8, 15, 8, 0), // Fri 8:00 AM
    description: "Rounds to 16:00 boundary → roll to next day 8:00"
  },
  {
    name: "Task starting Friday morning with 0.99 days",
    startDate: createDate(2025, 8, 15, 8, 0), // Fri 8:00 AM
    estimatedDays: 0.99, // 7.92 hours
    expectedCompletion: createDate(2025, 8, 15, 15, 55), // Fri ~3:55 PM
    description: "Nearly a full day ends before 4 PM"
  },
  {
    name: "Task starting Thu 8:00 with 4.125 days",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 4.125, // 33 hours
    expectedCompletion: createDate(2025, 8, 20, 9, 0), // Wed 9:00 AM
    description: "4 full days (Thu,Fri,Mon,Tue) + 1h on Wed"
  },
  {
    name: "Task starting Thu 8:00 with 7.999 days",
    startDate: createDate(2025, 8, 14, 8, 0), // Thu 8:00 AM
    estimatedDays: 7.999, // 63.992 hours
    expectedCompletion: createDate(2025, 8, 25, 16, 0), // Mon 4:00 PM
    description: "Spans two weeks, finishes at boundary on Mon"
  }
];

/**
 * Run all test cases
 */
function runTests(): void {
  console.log("🧪 Testing Intraday Completion Date Calculation\n");
  console.log("Workday: 8:00 AM - 4:00 PM (8 hours)\n");
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 ${testCase.name}`);
    console.log(`   Start: ${formatDate(testCase.startDate)}`);
    console.log(`   Estimated: ${testCase.estimatedDays} days`);
    console.log(`   Expected: ${formatDate(testCase.expectedCompletion)}`);
    
    const actual = calculateIntradayCompletionSimple(testCase.startDate, testCase.estimatedDays);
    console.log(`   Actual:   ${formatDate(actual)}`);
    
    const isCorrect = Math.abs(actual.getTime() - testCase.expectedCompletion.getTime()) < 60000; // Within 1 minute
    
    if (isCorrect) {
      console.log(`   ✅ PASS: ${testCase.description}`);
      passed++;
    } else {
      console.log(`   ❌ FAIL: Expected ${formatDate(testCase.expectedCompletion)}, got ${formatDate(actual)}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log("🎉 All tests passed! The intraday logic is working correctly.");
  } else {
    console.log("⚠️  Some tests failed. Check the logic implementation.");
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

export { calculateIntradayCompletionSimple, TestCase, testCases };
