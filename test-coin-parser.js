// Test the Coin parser functionality
import { PokerCSVParser } from "./server/csvParser.js";

const testContent = `AccountAction AmountCurrencyTransaction details Date and timeStatus
 kdo Withdrawal-50 USDT NL Hold'em - ?50 Sprint 2025-01-02 21:37:42Approved
 kdo Deposit 131.25 USDT NL Hold'em - ?50 Sprint 2025-01-02 22:07:10Approved
 kdo Withdrawal-25 USDT NL Hold'em - ?25 Deepstack 6-max Hyper 2025-01-02 21:56:00Approved
 kdo Deposit 0 USDT NL Hold'em - ?25 Deepstack 6-max Hyper 2025-01-02 22:17:23Approved`;

async function testCoinParser() {
  try {
    const tournaments = await PokerCSVParser.parseCoinTXT(testContent, "test-user", {});
    console.log("Parsed tournaments:", JSON.stringify(tournaments, null, 2));
  } catch (error) {
    console.error("Error parsing:", error);
  }
}

testCoinParser();