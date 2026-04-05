import { tool } from "ai";
import { z } from "zod";
import { db } from "./firebase";

const ALLOWED_COLLECTIONS = [
  "ambassadorRequests", "apprenticeMonthlyStats", "apprenticePayments",
  "apprenticePublicData", "bugs", "deferredScheduleTasks", "degreeNames",
  "faq", "giftCards", "interestSchools", "meetings", "monthlyDetails",
  "monthlyRecap", "notifications", "payments", "postalCodes", "questions",
  "reviews", "schoolTypes", "schools", "searchPostalCode", "services",
  "servicesType", "settings", "users",
];

export const queryCollection = tool({
  description: `Query any Firestore collection. Available collections: ${ALLOWED_COLLECTIONS.join(", ")}. Use this to search for documents by field values.`,
  inputSchema: z.object({
    collection: z.string().describe("Collection name (e.g. meetings, users, services, payments, monthlyRecap)"),
    field: z.string().describe("Field to filter on. Empty string to skip filter and get recent docs."),
    operator: z.string().describe("Firestore operator: ==, !=, >, <, >=, <=, array-contains"),
    value: z.string().describe("Value to match. For numbers, pass as string (will be auto-converted)."),
    limit: z.string().describe("Max results as string (default 3, max 10)"),
  }),
  execute: async ({ collection, field, operator, value, limit }) => {
    console.log(`[queryCollection] ${collection} where ${field} ${operator} ${value} limit ${limit}`);
    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return { error: `Collection "${collection}" not allowed. Use one of: ${ALLOWED_COLLECTIONS.join(", ")}` };
    }
    try {
      let query: FirebaseFirestore.Query = db.collection(collection);
      if (field && operator && value !== undefined) {
        let parsedValue: any = value;
        if (value === "true") parsedValue = true;
        else if (value === "false") parsedValue = false;
        else if (!isNaN(Number(value)) && value !== "") parsedValue = Number(value);
        query = query.where(field, operator as FirebaseFirestore.WhereFilterOp, parsedValue);
      }
      query = query.limit(Math.min(parseInt(limit) || 3, 10));

      const snapshot = await query.get();
      console.log(`[queryCollection] Got ${snapshot.size} results from ${collection}`);

      const results = snapshot.docs.map((doc) => {
        const d = doc.data();
        const result: any = { _id: doc.id };
        for (const [key, val] of Object.entries(d)) {
          if (key === "privateKey" || key === "bankToken" || key === "identityDocuments") {
            result[key] = "[REDACTED]";
          } else if (val && typeof val === "object" && val.toDate) {
            result[key] = val.toDate().toISOString();
          } else if (Array.isArray(val) && val.length > 10) {
            result[key] = `[Array of ${val.length} items]`;
          } else if (typeof val === "object" && val !== null && !val.toDate && JSON.stringify(val).length > 300) {
            result[key] = `[Object with ${Object.keys(val).length} keys]`;
          } else {
            result[key] = val;
          }
        }
        return result;
      });

      if (JSON.stringify(results).length > 5000) {
        console.log(`[queryCollection] Response truncated`);
        return results.slice(0, 3);
      }
      return results;
    } catch (e: any) {
      console.error(`[queryCollection] Error: ${e.message}`);
      return { error: e.message };
    }
  },
});

export const getDocument = tool({
  description: "Get a single Firestore document by ID, optionally with its subcollection (e.g. history).",
  inputSchema: z.object({
    collection: z.string().describe("Collection name"),
    docId: z.string().describe("Document ID"),
    subcollection: z.string().describe("Subcollection to fetch (e.g. 'history'). Empty string to skip."),
  }),
  execute: async ({ collection, docId, subcollection }) => {
    console.log(`[getDocument] ${collection}/${docId} sub=${subcollection}`);
    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return { error: `Collection "${collection}" not allowed.` };
    }
    try {
      const docRef = db.collection(collection).doc(docId);
      const doc = await docRef.get();
      if (!doc.exists) return { error: `Document ${collection}/${docId} not found` };

      const data = doc.data()!;
      const result: any = { _id: doc.id };
      for (const [key, val] of Object.entries(data)) {
        if (key === "privateKey" || key === "bankToken" || key === "identityDocuments") {
          result[key] = "[REDACTED]";
        } else if (val && typeof val === "object" && val.toDate) {
          result[key] = val.toDate().toISOString();
        } else if (Array.isArray(val) && val.length > 10) {
          result[key] = `[Array of ${val.length} items, first 3: ${JSON.stringify(val.slice(0, 3)).substring(0, 200)}]`;
        } else if (typeof val === "object" && val !== null && !val.toDate && JSON.stringify(val).length > 500) {
          result[key] = `[Object, keys: ${Object.keys(val).join(", ")}]`;
        } else {
          result[key] = val;
        }
      }

      if (subcollection) {
        const subSnap = await docRef.collection(subcollection).limit(20).get();
        console.log(`[getDocument] Got ${subSnap.size} subcollection docs`);
        result[`_${subcollection}`] = subSnap.docs.map((d) => {
          const sd = d.data();
          const sub: any = { _id: d.id };
          for (const [key, val] of Object.entries(sd)) {
            sub[key] = val && typeof val === "object" && val.toDate ? val.toDate().toISOString() : val;
          }
          return sub;
        });
      }

      return result;
    } catch (e: any) {
      console.error(`[getDocument] Error: ${e.message}`);
      return { error: e.message };
    }
  },
});

export const createJiraTicket = tool({
  description: "Create a Jira ticket. Only call when user explicitly confirms (says ok, valide, cree-le).",
  inputSchema: z.object({
    title: z.string().describe("Short ticket title"),
    description: z.string().describe("Detailed description"),
    priority: z.string().describe("Highest, High, Medium, Low, or Lowest"),
    issueType: z.string().describe("Bug, Story, or Task"),
  }),
  execute: async ({ title, description, priority, issueType }) => {
    console.log(`[createJiraTicket] title=${title} type=${issueType} priority=${priority}`);
    try {
      const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");

      const response = await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/issue`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            project: { key: process.env.JIRA_PROJECT_KEY },
            summary: title,
            description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] },
            issuetype: { name: issueType === "Story" ? "Story" : issueType === "Task" ? "Task" : "Bug" },
            priority: { name: priority || "Medium" },
          },
        }),
      });

      if (!response.ok) return { error: `Jira error: ${await response.text()}` };
      const data = await response.json();
      console.log(`[createJiraTicket] Created ${data.key}`);
      return { success: true, key: data.key, url: `${process.env.JIRA_BASE_URL}/browse/${data.key}` };
    } catch (e: any) {
      console.error(`[createJiraTicket] Error: ${e.message}`);
      return { error: e.message };
    }
  },
});
