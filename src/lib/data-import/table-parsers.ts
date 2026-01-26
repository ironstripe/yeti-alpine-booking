// Table-specific parsers for YETI data import
import { parseCSVContent, detectDelimiter, type ParsedRow, type CSVParseResult } from "./csv-parser";
import {
  cleanString,
  parseNumber,
  parseBoolean,
  isValidUUID,
  isValidDate,
  isValidTime,
  isValidEmail,
} from "./validation";
import type { TablesInsert } from "@/integrations/supabase/types";

type ProductInsert = TablesInsert<"products">;
type InstructorInsert = TablesInsert<"instructors">;
type CustomerInsert = TablesInsert<"customers">;
type ParticipantInsert = TablesInsert<"customer_participants">;
type TicketInsert = TablesInsert<"tickets">;
type TicketItemInsert = TablesInsert<"ticket_items">;

// ============ PRODUCTS PARSER ============

export function parseProductsCSV(content: string): CSVParseResult<ProductInsert> {
  const delimiter = detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return { rows: [], headers: [], validCount: 0, warningCount: 0, errorCount: 1 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow<ProductInsert>[] = [];
  let validCount = 0, warningCount = 0, errorCount = 0;

  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};

    headers.forEach((h, idx) => (originalData[h] = row[idx] || ""));

    const id = cleanString(row[headerMap.get("id") ?? -1]);
    const name = cleanString(row[headerMap.get("name") ?? -1]);
    const type = cleanString(row[headerMap.get("type") ?? -1]);
    const price = parseNumber(row[headerMap.get("price") ?? -1] || "0") || 0;
    const durationMinutes = parseNumber(row[headerMap.get("duration_minutes") ?? -1] || "120");
    const isActive = row[headerMap.get("is_active") ?? -1];
    const pricingType = cleanString(row[headerMap.get("pricing_type") ?? -1]);
    const sortOrder = parseNumber(row[headerMap.get("sort_order") ?? -1] || "0");

    if (id && !isValidUUID(id)) errors.push("Invalid UUID format for id");
    if (!name) errors.push("Name is required");
    if (!type) errors.push("Type is required");

    const data: Partial<ProductInsert> = {
      id: id || undefined,
      name: name || "",
      type: type || "private",
      price,
      duration_minutes: durationMinutes,
      is_active: isActive === undefined || isActive === "" ? true : parseBoolean(isActive),
      pricing_type: pricingType || "flat",
      sort_order: sortOrder || 0,
    };

    const isValid = errors.length === 0;
    if (errors.length > 0) errorCount++;
    else if (warnings.length > 0) { warningCount++; validCount++; }
    else validCount++;

    parsedRows.push({ rowNumber, data, warnings, errors, isValid, originalData });
  }

  return { rows: parsedRows, headers, validCount, warningCount, errorCount };
}

// ============ INSTRUCTORS PARSER ============

export function parseInstructorsCSV(content: string): CSVParseResult<InstructorInsert> {
  const delimiter = detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return { rows: [], headers: [], validCount: 0, warningCount: 0, errorCount: 1 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow<InstructorInsert>[] = [];
  let validCount = 0, warningCount = 0, errorCount = 0;

  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};

    headers.forEach((h, idx) => (originalData[h] = row[idx] || ""));

    const id = cleanString(row[headerMap.get("id") ?? -1]);
    const firstName = cleanString(row[headerMap.get("first_name") ?? -1]);
    const lastName = cleanString(row[headerMap.get("last_name") ?? -1]);
    const email = cleanString(row[headerMap.get("email") ?? -1]);
    const phone = cleanString(row[headerMap.get("phone") ?? -1]);
    const hourlyRate = parseNumber(row[headerMap.get("hourly_rate") ?? -1] || "30") || 30;
    const status = cleanString(row[headerMap.get("status") ?? -1]);
    const specialization = cleanString(row[headerMap.get("specialization") ?? -1]);
    const level = cleanString(row[headerMap.get("level") ?? -1]);
    const languagesStr = cleanString(row[headerMap.get("languages") ?? -1]);

    if (id && !isValidUUID(id)) errors.push("Invalid UUID format for id");
    if (!firstName) errors.push("First name is required");
    if (!lastName) errors.push("Last name is required");
    if (!email) errors.push("Email is required");
    else if (!isValidEmail(email)) errors.push("Invalid email format");
    if (!phone) errors.push("Phone is required");

    // Parse languages array
    let languages: string[] = ["de"];
    if (languagesStr) {
      try {
        // Try JSON array format first
        if (languagesStr.startsWith("[")) {
          languages = JSON.parse(languagesStr.replace(/'/g, '"'));
        } else {
          languages = languagesStr.split(",").map((l) => l.trim().toLowerCase());
        }
      } catch {
        languages = [languagesStr.toLowerCase()];
      }
    }

    const data: Partial<InstructorInsert> = {
      id: id || undefined,
      first_name: firstName || "",
      last_name: lastName || "",
      email: email || "",
      phone: phone || "",
      hourly_rate: hourlyRate,
      status: status || "active",
      specialization: specialization || "ski",
      level: level || "hilfslehrer",
      languages,
      real_time_status: "unavailable",
    };

    const isValid = errors.length === 0;
    if (errors.length > 0) errorCount++;
    else if (warnings.length > 0) { warningCount++; validCount++; }
    else validCount++;

    parsedRows.push({ rowNumber, data, warnings, errors, isValid, originalData });
  }

  return { rows: parsedRows, headers, validCount, warningCount, errorCount };
}

// ============ CUSTOMERS PARSER ============

export function parseCustomersCSV(content: string): CSVParseResult<CustomerInsert> {
  const delimiter = detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return { rows: [], headers: [], validCount: 0, warningCount: 0, errorCount: 1 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow<CustomerInsert>[] = [];
  let validCount = 0, warningCount = 0, errorCount = 0;

  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};

    headers.forEach((h, idx) => (originalData[h] = row[idx] || ""));

    const id = cleanString(row[headerMap.get("id") ?? -1]);
    const email = cleanString(row[headerMap.get("email") ?? -1]);
    const lastName = cleanString(row[headerMap.get("last_name") ?? -1]);
    const firstName = cleanString(row[headerMap.get("first_name") ?? -1]);
    const phone = cleanString(row[headerMap.get("phone") ?? -1]);
    const holidayAddress = cleanString(row[headerMap.get("holiday_address") ?? -1]);
    const street = cleanString(row[headerMap.get("street") ?? -1]);
    const zip = cleanString(row[headerMap.get("zip") ?? -1]);
    const city = cleanString(row[headerMap.get("city") ?? -1]);
    const country = cleanString(row[headerMap.get("country") ?? -1]);
    const language = cleanString(row[headerMap.get("language") ?? -1]);
    const notes = cleanString(row[headerMap.get("notes") ?? -1]);
    const customerType = cleanString(row[headerMap.get("customer_type") ?? -1]);

    if (id && !isValidUUID(id)) errors.push("Invalid UUID format for id");
    if (!email) errors.push("Email is required");
    else if (!isValidEmail(email)) warnings.push("Invalid email format");
    if (!lastName) errors.push("Last name is required");

    const data: Partial<CustomerInsert> = {
      id: id || undefined,
      email: email || "",
      last_name: lastName || "",
      first_name: firstName,
      phone,
      holiday_address: holidayAddress || "",
      street,
      zip,
      city,
      country: country || "CH",
      language: language || "de",
      notes,
      customer_type: customerType || "family",
    };

    const isValid = errors.length === 0;
    if (errors.length > 0) errorCount++;
    else if (warnings.length > 0) { warningCount++; validCount++; }
    else validCount++;

    parsedRows.push({ rowNumber, data, warnings, errors, isValid, originalData });
  }

  return { rows: parsedRows, headers, validCount, warningCount, errorCount };
}

// ============ PARTICIPANTS PARSER ============

export function parseParticipantsCSV(content: string): CSVParseResult<ParticipantInsert> {
  const delimiter = detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return { rows: [], headers: [], validCount: 0, warningCount: 0, errorCount: 1 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow<ParticipantInsert>[] = [];
  let validCount = 0, warningCount = 0, errorCount = 0;

  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};

    headers.forEach((h, idx) => (originalData[h] = row[idx] || ""));

    const id = cleanString(row[headerMap.get("id") ?? -1]);
    const customerId = cleanString(row[headerMap.get("customer_id") ?? -1]);
    const firstName = cleanString(row[headerMap.get("first_name") ?? -1]);
    const lastName = cleanString(row[headerMap.get("last_name") ?? -1]);
    const birthDate = cleanString(row[headerMap.get("birth_date") ?? -1]);
    const sport = cleanString(row[headerMap.get("sport") ?? -1]);
    const levelCurrentSeason = cleanString(row[headerMap.get("level_current_season") ?? -1]);
    const notes = cleanString(row[headerMap.get("notes") ?? -1]);

    if (id && !isValidUUID(id)) errors.push("Invalid UUID format for id");
    if (!customerId) errors.push("Customer ID is required");
    else if (!isValidUUID(customerId)) errors.push("Invalid UUID format for customer_id");
    if (!firstName) errors.push("First name is required");
    if (!birthDate) errors.push("Birth date is required");
    else if (!isValidDate(birthDate)) errors.push("Invalid date format for birth_date");

    const data: Partial<ParticipantInsert> = {
      id: id || undefined,
      customer_id: customerId || "",
      first_name: firstName || "",
      last_name: lastName,
      birth_date: birthDate || "",
      sport: sport || "ski",
      level_current_season: levelCurrentSeason || "anfaenger",
      notes,
    };

    const isValid = errors.length === 0;
    if (errors.length > 0) errorCount++;
    else if (warnings.length > 0) { warningCount++; validCount++; }
    else validCount++;

    parsedRows.push({ rowNumber, data, warnings, errors, isValid, originalData });
  }

  return { rows: parsedRows, headers, validCount, warningCount, errorCount };
}

// ============ TICKETS PARSER ============

export function parseTicketsCSV(content: string): CSVParseResult<TicketInsert> {
  const delimiter = detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return { rows: [], headers: [], validCount: 0, warningCount: 0, errorCount: 1 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow<TicketInsert>[] = [];
  let validCount = 0, warningCount = 0, errorCount = 0;

  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};

    headers.forEach((h, idx) => (originalData[h] = row[idx] || ""));

    const id = cleanString(row[headerMap.get("id") ?? -1]);
    const ticketNumber = cleanString(row[headerMap.get("ticket_number") ?? -1]);
    const customerId = cleanString(row[headerMap.get("customer_id") ?? -1]);
    const status = cleanString(row[headerMap.get("status") ?? -1]);
    const totalAmount = parseNumber(row[headerMap.get("total_amount") ?? -1] || "0") || 0;
    const paidAmount = parseNumber(row[headerMap.get("paid_amount") ?? -1] || "0") || 0;
    const paymentMethod = cleanString(row[headerMap.get("payment_method") ?? -1]);
    const notes = cleanString(row[headerMap.get("notes") ?? -1]);
    const ticketType = cleanString(row[headerMap.get("ticket_type") ?? -1]);

    if (id && !isValidUUID(id)) errors.push("Invalid UUID format for id");
    if (!ticketNumber) errors.push("Ticket number is required");
    if (!customerId) errors.push("Customer ID is required");
    else if (!isValidUUID(customerId)) errors.push("Invalid UUID format for customer_id");

    const data: Partial<TicketInsert> = {
      id: id || undefined,
      ticket_number: ticketNumber || "",
      customer_id: customerId || "",
      status: status || "open",
      total_amount: totalAmount,
      paid_amount: paidAmount,
      payment_method: paymentMethod,
      notes,
      ticket_type: ticketType || "private",
    };

    const isValid = errors.length === 0;
    if (errors.length > 0) errorCount++;
    else if (warnings.length > 0) { warningCount++; validCount++; }
    else validCount++;

    parsedRows.push({ rowNumber, data, warnings, errors, isValid, originalData });
  }

  return { rows: parsedRows, headers, validCount, warningCount, errorCount };
}

// ============ TICKET ITEMS PARSER ============

export function parseTicketItemsCSV(content: string): CSVParseResult<TicketItemInsert> {
  const delimiter = detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return { rows: [], headers: [], validCount: 0, warningCount: 0, errorCount: 1 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow<TicketItemInsert>[] = [];
  let validCount = 0, warningCount = 0, errorCount = 0;

  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};

    headers.forEach((h, idx) => (originalData[h] = row[idx] || ""));

    const id = cleanString(row[headerMap.get("id") ?? -1]);
    const ticketId = cleanString(row[headerMap.get("ticket_id") ?? -1]);
    const productId = cleanString(row[headerMap.get("product_id") ?? -1]);
    const participantId = cleanString(row[headerMap.get("participant_id") ?? -1]);
    const instructorId = cleanString(row[headerMap.get("instructor_id") ?? -1]);
    const date = cleanString(row[headerMap.get("date") ?? -1]);
    const timeStart = cleanString(row[headerMap.get("time_start") ?? -1]);
    const timeEnd = cleanString(row[headerMap.get("time_end") ?? -1]);
    const unitPrice = parseNumber(row[headerMap.get("unit_price") ?? -1] || "0") || 0;
    const status = cleanString(row[headerMap.get("status") ?? -1]);
    const meetingPoint = cleanString(row[headerMap.get("meeting_point") ?? -1]);
    const skillLevel = cleanString(row[headerMap.get("skill_level") ?? -1]);
    const instructorConfirmation = cleanString(row[headerMap.get("instructor_confirmation") ?? -1]);
    const groupName = cleanString(row[headerMap.get("group_name") ?? -1]);

    if (id && !isValidUUID(id)) errors.push("Invalid UUID format for id");
    if (!ticketId) errors.push("Ticket ID is required");
    else if (!isValidUUID(ticketId)) errors.push("Invalid UUID format for ticket_id");
    if (productId && !isValidUUID(productId)) warnings.push("Invalid UUID format for product_id");
    if (participantId && !isValidUUID(participantId)) warnings.push("Invalid UUID format for participant_id");
    if (instructorId && !isValidUUID(instructorId)) warnings.push("Invalid UUID format for instructor_id");
    if (date && !isValidDate(date)) errors.push("Invalid date format");
    if (timeStart && !isValidTime(timeStart)) warnings.push("Invalid time format for time_start");
    if (timeEnd && !isValidTime(timeEnd)) warnings.push("Invalid time format for time_end");

    const data: Partial<TicketItemInsert> = {
      id: id || undefined,
      ticket_id: ticketId || "",
      product_id: productId || undefined,
      participant_id: participantId || undefined,
      instructor_id: instructorId || undefined,
      date: date || undefined,
      time_start: timeStart || undefined,
      time_end: timeEnd || undefined,
      unit_price: unitPrice,
      status: status || "scheduled",
      meeting_point: meetingPoint,
      skill_level: skillLevel,
      instructor_confirmation: instructorConfirmation || "pending",
      group_name: groupName,
    };

    const isValid = errors.length === 0;
    if (errors.length > 0) errorCount++;
    else if (warnings.length > 0) { warningCount++; validCount++; }
    else validCount++;

    parsedRows.push({ rowNumber, data, warnings, errors, isValid, originalData });
  }

  return { rows: parsedRows, headers, validCount, warningCount, errorCount };
}
