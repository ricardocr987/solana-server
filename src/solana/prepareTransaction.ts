import { TransactionInstruction, PublicKey, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";
import bs58 from "bs58";

export async function prepareTokenAccountTransaction(initAccountInstruction: TransactionInstruction, payerKey: PublicKey) {
  const instructions = [initAccountInstruction];
  const recentBlockhash = (await config.RPC.getLatestBlockhash('finalized')).blockhash;
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transactionToEstimatePriority = new VersionedTransaction(message);
  const microLamports = await getPriorityFeeEstimate('High', transactionToEstimatePriority) || 20000;

  const computePriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
  instructions.unshift(computePriceInstruction);

  const units = await getComputeUnits([...instructions], payerKey);
  const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units });
  instructions.unshift(computeBudgetInstruction);

  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);
  
  return Buffer.from(transaction.serialize()).toString('base64');
}

export async function prepareTransaction(transferInstruction: TransactionInstruction, payerKey: PublicKey) {
  const instructions = [transferInstruction];
  const recentBlockhash = (await config.RPC.getLatestBlockhash('finalized')).blockhash;
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transactionToEstimatePriority = new VersionedTransaction(message);
  const microLamports = await getPriorityFeeEstimate('High', transactionToEstimatePriority) || 20000;

  const computePriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
  instructions.unshift(computePriceInstruction);

  //const units = await getComputeUnits([...instructions], payerKey);
  const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 6861 });
  instructions.unshift(computeBudgetInstruction);

  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);
  
  return Buffer.from(transaction.serialize()).toString('base64');
}

// useful if we have dynamic transaction to provide, but for now we are using the same one
async function getComputeUnits(originalInstructions: TransactionInstruction[], payerKey: PublicKey): Promise<number> {
  // dont modify original instructions array
  const instructions = [...originalInstructions];

  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1400000,
  });
  instructions.unshift(computeBudgetIx);

  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: PublicKey.default.toString(),
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  const rpcResponse = await config.RPC.simulateTransaction(transaction, {
    replaceRecentBlockhash: true,
    sigVerify: false,
  });

  return rpcResponse.value.unitsConsumed || 1400000;
}

// this method makes the transaction building process so slow
// interesting to use a websocket to read blocks or in an interval, 
// store median priority in db and get an estimated priority from there
async function getPriorityFee(): Promise<number | null> {
  const blockHeight = (await config.RPC.getBlockHeight());
  const blockData = await config.RPC.getBlock(blockHeight, { maxSupportedTransactionVersion: 0 });

  if (!blockData || !blockData.transactions) {
    return null;
  }

  const transactionsInfo = blockData.transactions
    .filter(tx => tx.meta && tx.meta.fee > 5000 && tx.meta.computeUnitsConsumed !== undefined && tx.meta.computeUnitsConsumed > 0)
    .map(tx => ({
      fee: tx.meta!.fee,
      computeUnitsConsumed: tx.meta!.computeUnitsConsumed!
    }));

  const priorityFees = transactionsInfo.map(txInfo => (txInfo.fee - 5000) / txInfo.computeUnitsConsumed);
  priorityFees.sort((a, b) => a - b);

  let medianPriorityFee = 0;
  if (priorityFees.length > 0) {
    const n = priorityFees.length;
    if (n % 2 === 0) {
      medianPriorityFee = (priorityFees[Math.floor(n / 2) - 1] + priorityFees[Math.floor(n / 2)]) / 2;
    } else {
      medianPriorityFee = priorityFees[Math.floor(n / 2)];
    }
  }

  return Math.round(medianPriorityFee * 10 ** 6);
}

async function getPriorityFeeEstimate(priorityLevel: string, transaction: VersionedTransaction) {
  const response = await fetch(config.RPC.rpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getPriorityFeeEstimate",
      params: [
        {
          transaction: bs58.encode(transaction.serialize()),
          options: { priorityLevel },
        },
      ],
    }),
  });
  const data = await response.json();
  return Number(data.result.priorityFeeEstimate);
}