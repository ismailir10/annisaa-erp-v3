import { countAttendanceDays } from "./working-days";

export type SalaryComponent = {
  id: string;
  code: string;
  label: string;
  category: "INCOME" | "DEDUCTION";
  calcType: "FIXED" | "PCT_OF_BASE" | "ATTENDANCE_BASED";
  isProRated: boolean;
  sortOrder: number;
};

export type EmployeeSalaryValue = {
  componentDefId: string;
  value: number;
};

export type AttendanceVariables = {
  overtimeHours: number;
  outdoorDays: number;
  holidayWorkedDays: number;
  dcDays: number;
};

export type PayrollLineResult = {
  componentDefId: string;
  labelSnapshot: string;
  categorySnapshot: "INCOME" | "DEDUCTION";
  calculatedAmount: number;
  finalAmount: number;
};

export type PayrollItemResult = {
  lines: PayrollLineResult[];
  grossAmount: number;
  deductions: number;
  netAmount: number;
};

/**
 * Calculate payroll for a single employee.
 */
export function calculateEmployeePayroll(
  components: SalaryComponent[],
  salaryValues: EmployeeSalaryValue[],
  daysPresent: number,
  daysLeave: number,
  actualWorkingDays: number,
  variables: AttendanceVariables
): PayrollItemResult {
  const valueMap = new Map<string, number>();
  for (const sv of salaryValues) {
    valueMap.set(sv.componentDefId, sv.value);
  }

  // Sort components by sortOrder
  const sorted = [...components].sort((a, b) => a.sortOrder - b.sortOrder);

  const lines: PayrollLineResult[] = [];
  let gajiPokokAmount = 0;

  // Total present for pro-rating includes leave (paid leave counts)
  const totalPresentForProRating = daysPresent + daysLeave;

  for (const comp of sorted) {
    const baseValue = valueMap.get(comp.id) ?? 0;
    let amount = 0;

    switch (comp.calcType) {
      case "FIXED":
        if (comp.isProRated && actualWorkingDays > 0) {
          amount = baseValue * (totalPresentForProRating / actualWorkingDays);
        } else {
          amount = baseValue;
        }
        break;

      case "PCT_OF_BASE":
        amount = gajiPokokAmount * (baseValue / 100);
        break;

      case "ATTENDANCE_BASED":
        amount = calculateAttendanceBased(comp.code, baseValue, daysPresent, variables);
        break;
    }

    // Track gaji_pokok for PCT_OF_BASE calculations
    if (comp.code === "gaji_pokok") {
      gajiPokokAmount = amount;
    }

    amount = Math.round(amount);

    lines.push({
      componentDefId: comp.id,
      labelSnapshot: comp.label,
      categorySnapshot: comp.category,
      calculatedAmount: amount,
      finalAmount: amount,
    });
  }

  const grossAmount = lines
    .filter((l) => l.categorySnapshot === "INCOME")
    .reduce((sum, l) => sum + l.finalAmount, 0);

  const deductions = lines
    .filter((l) => l.categorySnapshot === "DEDUCTION")
    .reduce((sum, l) => sum + l.finalAmount, 0);

  return {
    lines,
    grossAmount,
    deductions,
    netAmount: grossAmount - deductions,
  };
}

/**
 * Determine the multiplier for ATTENDANCE_BASED components.
 */
function calculateAttendanceBased(
  code: string,
  perUnitValue: number,
  daysPresent: number,
  variables: AttendanceVariables
): number {
  switch (code) {
    case "tunjangan_transport":
      return perUnitValue * daysPresent;
    case "tunjangan_msk":
      return perUnitValue * variables.holidayWorkedDays;
    case "insentif_outdoor":
      return perUnitValue * variables.outdoorDays;
    case "insentif_libur":
      return perUnitValue * variables.holidayWorkedDays;
    case "insentif_dc":
      return perUnitValue * variables.dcDays;
    case "lembur":
      return perUnitValue * variables.overtimeHours;
    default:
      // Generic attendance-based: multiply by days present
      return perUnitValue * daysPresent;
  }
}

/**
 * Calculate payroll for all employees in a period.
 */
export function calculatePayroll(
  employees: {
    id: string;
    salaryValues: EmployeeSalaryValue[];
    attendanceRecords: { status: string }[];
    variables?: AttendanceVariables;
  }[],
  components: SalaryComponent[],
  actualWorkingDays: number
): Map<string, PayrollItemResult> {
  const results = new Map<string, PayrollItemResult>();

  const defaultVars: AttendanceVariables = {
    overtimeHours: 0,
    outdoorDays: 0,
    holidayWorkedDays: 0,
    dcDays: 0,
  };

  for (const emp of employees) {
    const { daysPresent, daysLeave } = countAttendanceDays(emp.attendanceRecords);
    const result = calculateEmployeePayroll(
      components,
      emp.salaryValues,
      daysPresent,
      daysLeave,
      actualWorkingDays,
      emp.variables ?? defaultVars
    );
    results.set(emp.id, result);
  }

  return results;
}
