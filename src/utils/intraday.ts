import { TIMEZONE, WORKDAY_START_HOUR, WORKDAY_END_HOUR } from '../webhook/config';

export interface IntradayOptions {
  timezone?: string;
  workdayStartHour?: number;
  workdayEndHour?: number;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function setTime(d: Date, hour: number, minute = 0): Date {
  const nd = new Date(d);
  nd.setHours(hour, minute, 0, 0);
  return nd;
}

function nextBusinessStart(d: Date, startHour: number): Date {
  let nd = new Date(d);
  nd.setDate(nd.getDate() + 1);
  nd = setTime(nd, startHour, 0);
  while (isWeekend(nd)) {
    nd.setDate(nd.getDate() + 1);
  }
  return nd;
}

export function addBusinessHours(
  startDate: Date,
  hoursToAdd: number,
  opts: IntradayOptions = {}
): Date {
  const startHour = opts.workdayStartHour ?? WORKDAY_START_HOUR;
  const endHour = opts.workdayEndHour ?? WORKDAY_END_HOUR;
  let remaining = hoursToAdd;
  let cursor = new Date(startDate);

  // Normalize into window
  if (isWeekend(cursor)) {
    while (isWeekend(cursor)) cursor.setDate(cursor.getDate() + 1);
    cursor = setTime(cursor, startHour, 0);
  } else {
    const curHour = cursor.getHours() + cursor.getMinutes() / 60;
    if (curHour < startHour) cursor = setTime(cursor, startHour, 0);
    if (curHour >= endHour) cursor = nextBusinessStart(cursor, startHour);
  }

  let lastSegmentStartedAtDayStart = false;
  let lastSegmentEndedToday = false;

  while (remaining > 0) {
    if (isWeekend(cursor)) {
      while (isWeekend(cursor)) cursor.setDate(cursor.getDate() + 1);
      cursor = setTime(cursor, startHour, 0);
    }

    const curHour = cursor.getHours() + cursor.getMinutes() / 60;
    if (curHour < startHour) cursor = setTime(cursor, startHour, 0);
    if (curHour >= endHour) {
      cursor = nextBusinessStart(cursor, startHour);
      continue;
    }

    const available = endHour - (cursor.getHours() + cursor.getMinutes() / 60);
    if (remaining <= available + 1e-9) {
      const beforeHour = cursor.getHours() + cursor.getMinutes() / 60;
      cursor = new Date(cursor.getTime() + remaining * 60 * 60 * 1000);
      const afterHour = cursor.getHours() + cursor.getMinutes() / 60;
      lastSegmentStartedAtDayStart = Math.abs(beforeHour - startHour) < 1e-9;
      lastSegmentEndedToday = true;
      const finishedAtEnd = Math.abs(afterHour - endHour) < 1e-9;
      if (finishedAtEnd && !lastSegmentStartedAtDayStart) {
        cursor = nextBusinessStart(cursor, startHour);
      }
      remaining = 0;
    } else {
      // consume full day
      cursor = new Date(cursor.getTime() + available * 60 * 60 * 1000);
      remaining -= available;
      cursor = nextBusinessStart(cursor, startHour);
    }
  }

  // Round up to next minute
  if (cursor.getSeconds() > 0 || cursor.getMilliseconds() > 0) {
    cursor = new Date(cursor.getTime() + (60 * 1000 - (cursor.getSeconds() * 1000 + cursor.getMilliseconds())));
  }
  cursor.setSeconds(0, 0);

  const hour = cursor.getHours();
  const minute = cursor.getMinutes();
  if (lastSegmentEndedToday && !lastSegmentStartedAtDayStart && (hour >= endHour)) {
    cursor = nextBusinessStart(cursor, startHour);
  }

  return cursor;
}

export function daysToHours(days: number, workdayStartHour = WORKDAY_START_HOUR, workdayEndHour = WORKDAY_END_HOUR): number {
  return days * (workdayEndHour - workdayStartHour);
}

