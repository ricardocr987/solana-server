import { PublicKey } from "@solana/web3.js";
import { createTransferInstruction } from "./solana/transferInstruction";
import { prepareTokenAccountTransaction, prepareTransaction } from "./solana/prepareTransaction";
import { validateTransfer } from "./solana/validateTransfer";
import { APP_REFERENCE, MINT_DECIMALS, USDC_MINT } from "./constants";
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DatasetSales } from "./types";
import { getDataset } from "./aleph";
import BigNumber from 'bignumber.js';
import { Elysia, t } from "elysia";
import { config } from "./config";
import db from "./db";
import { confirmTransaction } from "./solana/confirmTransaction";

export type CreateTokenAccount = {
  signer: string;
}

export type SendTransaction = {
  transaction: string,
}

export type CreatePayment = {
  datasetId: string;
  signer: string;
}

export type SendPayment = {
  datasetId: string;
  transaction: string,
}

export const SendPaymentSchema = t.Object({
  datasetId: t.String(),
  transaction: t.String(),
});

export type GetTransactions = {
  address: string;
}

export const solanaManager = new Elysia({ prefix: '/solana' })
  .get('/createTokenAccount', async ({ query }: { query: CreateTokenAccount }) => {
    try {
      const signer = new PublicKey(query.signer);
      const senderInfo = await config.RPC.getAccountInfo(signer);
      if (!senderInfo) {
        const message = 'Ensure you have SOL on your wallet';
        console.error(message);
        return new Response(JSON.stringify({ error: message }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tokenAccount = getAssociatedTokenAddressSync(USDC_MINT, signer);
      const tokenAccountInfo = await config.RPC.getAccountInfo(tokenAccount);
      if (tokenAccountInfo) {
        return new Response(JSON.stringify({ message: 'Token account already exists' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const instruction = createAssociatedTokenAccountInstruction(signer, tokenAccount, signer, USDC_MINT);
      const serializedTransaction = await prepareTokenAccountTransaction(instruction, signer);
      return new Response(JSON.stringify({ transaction: serializedTransaction }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      console.error(e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  })

  .post('/sendTransaction', async ({ body }: { body: SendTransaction }) => {
    try {
      const signature = await confirmTransaction(body.transaction);
      return new Response(JSON.stringify({ message: 'success', signature }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return new Response(JSON.stringify({ message: 'error', error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  })

  .get('/createPaymentTransaction', async ({ query }: { query: CreatePayment }) => {
    try {
      const dataset = await getDataset(query.datasetId);
      if (!dataset || !dataset.price) {
        const message = 'Error fetching dataset or free dataset';
        console.error(message);
        return new Response(JSON.stringify({ error: message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const signer = new PublicKey(query.signer);
      const senderInfo = await config.RPC.getAccountInfo(signer);
      if (!senderInfo) {
        const message = 'Ensure you have SOL on your wallet';
        console.error(message);
        return new Response(JSON.stringify({ error: message }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const amount = new BigNumber(dataset.price);
      const recipient = new PublicKey(dataset.owner);
      const [datasetReference] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reference", "utf-8"),
          Buffer.from(query.datasetId, "hex"),
        ],
        TOKEN_PROGRAM_ID
      );

      const transferInstruction = await createTransferInstruction(recipient, amount, signer);

      transferInstruction.keys.push(
        { pubkey: datasetReference, isWritable: false, isSigner: false },
        { pubkey: APP_REFERENCE, isWritable: false, isSigner: false }
      );

      const serializedTransaction = await prepareTransaction(transferInstruction, signer);

      return new Response(JSON.stringify({ transaction: serializedTransaction }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      console.error(e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  })

  .post('/sendPaymentTransaction', async ({ body }: { body: SendPayment }) => {
    try {
      const signature = await confirmTransaction(body.transaction);
      await validateTransfer(signature, body.datasetId);
      
      return new Response(JSON.stringify({ message: 'success', signature }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return new Response(JSON.stringify({ message: 'error', error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }, { body: SendPaymentSchema })
  
  .get('/getTransactions', async ({ query: { address } }: { query: GetTransactions }) => {
    try {
      let totalProfit = new BigNumber(0);
      let totalSales = 0;
      const datasetSales: Record<string, DatasetSales> = {};
      
      const purchasesQuery = db.query("SELECT * FROM transactions WHERE signer = $signer");
      const purchases = purchasesQuery.all({ $signer: address });
      purchases.map((transaction: any) => {
        const amountInDecimal = new BigNumber(transaction.amount, 16);
        const amountWithDecimals = amountInDecimal.dividedBy(new BigNumber(10).pow(MINT_DECIMALS['USDC']));
        const amount = amountWithDecimals.toString();
        transaction.amount = amount;
      });

      const salesQuery = db.query("SELECT * FROM transactions WHERE seller = $seller");
      const sales = salesQuery.all({ $seller: address });
      sales.map((transaction: any) => {
        const amountInDecimal = new BigNumber(transaction.amount, 16);
        const amountWithDecimals = amountInDecimal.dividedBy(new BigNumber(10).pow(MINT_DECIMALS['USDC']));
        const amount = amountWithDecimals.toString();
        transaction.amount = amount;
      
        if (transaction.seller === address) {
          totalProfit = totalProfit.plus(amountWithDecimals);
          sales.push(transaction);
          if (datasetSales[transaction.datasetId]) {
            const profit = new BigNumber(datasetSales[transaction.datasetId].profit).plus(amountWithDecimals).toString();
            datasetSales[transaction.datasetId] = {
              sales: datasetSales[transaction.datasetId].sales++,
              profit,
            }
          } else {
            datasetSales[transaction.datasetId] = {
              sales: 1,
              profit: amount,
            };
          }
          totalSales++;
        }
      
        return transaction;
      });

      return new Response(JSON.stringify({ 
        totalProfit: totalProfit.toString(),
        purchases,
        sales,
        datasetSales,
        totalSales,
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return new Response(JSON.stringify({ message: 'error', error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  })
