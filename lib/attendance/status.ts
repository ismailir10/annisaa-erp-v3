/**
 * Determine attendance status based on check-in time vs org config.
 * Returns "PRESENT" or "LATE".
 */
export function determineCheckInStatus(
  checkInTime: Date,
  workStartTime: string, // "07:00"
  gracePeriodMinutes: number, // 15
  timezone: string // "Asia/Jakarta"
): "PRESENT" | "LATE" {
  // Get the check-in time in the school's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const checkInLocal = formatter.format(checkInTime);
  const [checkH, checkM] = checkInLocal.split(":").map(Number);
  const checkMinutes = checkH * 60 + checkM;

  // Parse grace end time
  const [startH, startM] = workStartTime.split(":").map(Number);
  const graceEndMinutes = startH * 60 + startM + gracePeriodMinutes;

  return checkMinutes <= graceEndMinutes ? "PRESENT" : "LATE";
}

/**
 * Calculate minutes late from work start time.
 */
export function minutesLate(
  checkInTime: Date,
  workStartTime: string,
  timezone: string
): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const checkInLocal = formatter.format(checkInTime);
  const [checkH, checkM] = checkInLocal.split(":").map(Number);
  const [startH, startM] = workStartTime.split(":").map(Number);

  const diff = (checkH * 60 + checkM) - (startH * 60 + startM);
  return Math.max(0, diff);
}
