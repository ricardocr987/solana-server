import { VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";

export async function confirmTransaction(transaction: string): Promise<string> {
  const transactionBuffer = Buffer.from(transaction, 'base64');
  const deserializedTransaction = VersionedTransaction.deserialize(transactionBuffer);
  const serializedTransaction = deserializedTransaction.serialize();
  let signature = await config.RPC.sendRawTransaction(serializedTransaction, {
    skipPreflight: true,
    maxRetries: 0,
  });

  console.log(`${new Date().toISOString()} Sending Transaction ${signature}`);

  const maxRetries = 5;
  let retries = 0;

  const confirmSignature = async () => {
    const confirmationPromise = new Promise((resolve) => {
      config.RPC.onSignature(signature, () => resolve(true), 'confirmed');
    });

    const racePromise = Promise.race([
      confirmationPromise,
      new Promise((resolve) => setTimeout(() => resolve(false), 3000))
    ]);

    racePromise.then(async (confirmed) => {
      if (confirmed) {
        // Transaction confirmed
        console.log(`${new Date().toISOString()} Transaction successfully confirmed: ${signature}`);
      } else {
        // Timeout occurred
        if (retries >= maxRetries) {
          console.error(`${new Date().toISOString()} Transaction confirmation failed after ${maxRetries} attempts: ${signature}`);
          return;
        }

        retries++;
        console.log(`${new Date().toISOString()} Retrying transaction, attempt ${retries}`);
        
        signature = await config.RPC.sendRawTransaction(serializedTransaction, {
          skipPreflight: true,
          maxRetries: 0,
        });

        await confirmSignature();
      }
    });
  };

  confirmSignature();

  return signature;
}