import { getDataset } from "./aleph";
import { Elysia, t } from "elysia";
import { config } from "./config";
import { ADAMIK_CHAINS } from "./constants";
import { ethers } from "ethers";

export type CreateTransactionParams = {
  blockchain: string;
  datasetId: string;
  signer: string;
}
  
export type SendTransaction = {
  blockchain: string;
  datasetId: string;
  transaction: string,
  encodedTransaction: string,
  signature: string,
}
  
export const SendTransactionSchema = t.Object({
  blockchain: t.String(),
  datasetId: t.String(),
  transaction: t.String(),
  encodedTransaction: t.String(),
  signature: t.String(),
});
  
export type GetTransactionsParams = {
  address: string;
}

export const evmManager = new Elysia({ prefix: '/evm' })
  .get('/createTransaction', async ({ query }: { query: CreateTransactionParams }) => {
    if (!ADAMIK_CHAINS.includes(query.blockchain)) {
      const message = 'Invalid blockchain';
      console.error(message);
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
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
  
      const requestBody = {
        transaction: {
          plain: {
            chainId: query.blockchain,
            mode: "transfer",
            senders: [query.signer],
            recipients: ['0xD305428Dd144698324452E6E08adbC804812223F'],
            amount: amountToSmallestUnit(dataset.price, 6),
            useMaxAmount: false,
            fees: "0",
            gas: "0",
            memo: "",
            format: "hex",
            tokenId: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
            validatorAddress: "",
            params: {
              pubKey: query.signer
            }
          }
        }
      };
  
      const response = await fetch('https://api.adamik.io/api/transaction/encode', {
        method: 'POST',
        headers: {
          Authorization: config.ADAMIK_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      const responseData = await response.json();

      if (response.ok) {
        return new Response(JSON.stringify({ transaction: JSON.stringify(responseData.transaction) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        console.error('Error encoding transaction:', responseData);
        return new Response(JSON.stringify({ error: responseData }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (e: any) {
      console.error(e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  })

  .post('/sendTransaction', async ({ body }: { body: SendTransaction }) => {
    if (!ADAMIK_CHAINS.includes(body.blockchain)) {
      const message = 'Invalid blockchain';
      console.error(message);
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  
    try {
      const plain = JSON.parse(body.transaction);
      plain.nonce = plain.nonce.toString();

      const requestBody = {
        transaction: {
          plain,
          encoded: body.encodedTransaction,
          signature: body.signature,
        }
      };

      const response = await fetch('https://api.adamik.io/api/transaction/broadcast', {
        method: 'POST',
        headers: {
          Authorization: config.ADAMIK_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.json();

      if (response.ok) {
        return new Response(JSON.stringify({ message: 'success', transaction: responseData.hash }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        console.error('Error broadcasting transaction:', responseData);
        return new Response(JSON.stringify({ error: responseData }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return new Response(JSON.stringify({ message: 'error', error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }, { body: SendTransactionSchema })
  
  .get('/getTransactions', async ({ query: { address } }: { query: GetTransactionsParams }) => {

  })


function amountToSmallestUnit(amount: string, decimals: number): string {
  const computedAmount = parseFloat(amount) * Math.pow(10, decimals);
  return computedAmount.toString();
}