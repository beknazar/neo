/**
 * AI search API client. Uses Perplexity under the hood.
 * Runs each query and returns raw text responses.
 */

import { cacheKey, getCachedResponse, setCachedResponse } from "./query-cache";

export interface QueryResult {
  query: string;
  response: string;
  runIndex: number;
  timestamp: number;
}

export interface QueryResultWithMeta extends QueryResult {
  fromCache?: boolean;
}

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export async function queryPerplexity(
  query: string,
  runIndex: number
): Promise<QueryResultWithMeta> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set");

  // Check cache first
  const key = cacheKey(query);
  const cached = await getCachedResponse(key);
  if (cached) {
    return { query, response: cached, runIndex, timestamp: Date.now(), fromCache: true };
  }

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_MODEL || "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful local business recommendation engine. When asked about local businesses, provide specific business names, their key features, and why you recommend them. Include website URLs when available.",
        },
        { role: "user", content: query },
      ],
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Perplexity API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const response = data.choices?.[0]?.message?.content ?? "";

  // Cache the response
  await setCachedResponse(key, query, response);

  return {
    query,
    response,
    runIndex,
    timestamp: Date.now(),
  };
}

/**
 * Run a batch of queries with concurrency control.
 * Each query is run `runsPerQuery` times.
 */
export async function runQueryBatch(
  queries: string[],
  runsPerQuery: number = 3,
  concurrency: number = 5
): Promise<QueryResult[]> {
  const tasks: Array<{ query: string; runIndex: number }> = [];
  for (const query of queries) {
    for (let i = 0; i < runsPerQuery; i++) {
      tasks.push({ query, runIndex: i });
    }
  }

  const results: QueryResult[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      const task = tasks[taskIndex];
      try {
        const result = await queryPerplexity(task.query, task.runIndex);
        results.push(result);
        // Only pace API calls, not cache hits
        if (!result.fromCache) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(
          `Query failed: "${task.query}" run ${task.runIndex}:`,
          err
        );
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results;
}
