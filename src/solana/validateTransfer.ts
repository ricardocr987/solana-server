
import { AccountLayout, TOKEN_PROGRAM_ID, transferCheckedInstructionData } from '@solana/spl-token';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TEN, APP_REFERENCE, MINT_DECIMALS } from '../constants';
import { getDataset, grantPermission } from '../aleph';
import { saveTransaction } from '../db';
import { Transaction } from '../types';
import BigNumber from 'bignumber.js';
import { config } from '../config';

export async function validateTransfer(signature: string, datasetId: string): Promise<Transaction> {
    const response = await fetchTransaction(signature);
    const { message } = response.transaction;
    const versionedTransaction = new VersionedTransaction(message);
    const instructions = versionedTransaction.message.compiledInstructions;
    const transferInstruction = instructions.pop();
    if (!transferInstruction) throw new Error('missing transfer instruction');

    const { amount } = transferCheckedInstructionData.decode(transferInstruction.data);
    const [source, mint, destination, owner, txDatasetReference, txAppReference] = transferInstruction.accountKeyIndexes.map(index => 
        versionedTransaction.message.staticAccountKeys[index],
    );

    const dataset = await getDataset(datasetId);
    if (!dataset || !dataset.price) throw new Error('dataset free or error fetching it');

    const [datasetReference] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reference", "utf-8"),
          Buffer.from(datasetId, "hex"),
        ],
        TOKEN_PROGRAM_ID
    );

    const signerATA = await config.RPC.getAccountInfo(source, 'confirmed');
    const sellerATA = await config.RPC.getAccountInfo(destination, 'confirmed');
    if (!sellerATA || !signerATA) throw new Error('error fetching ata info');

    const decodedSellerATA = AccountLayout.decode(sellerATA.data);
    const decodedSignerATA = AccountLayout.decode(signerATA.data);
    const seller = decodedSellerATA.owner.toBase58();
    const signer = decodedSignerATA.owner.toBase58();
    const price = BigNumber(dataset.price).times(TEN.pow(MINT_DECIMALS['USDC'])).integerValue(BigNumber.ROUND_FLOOR);

    if (amount.toString() !== price.toString()) throw new Error('amount not transferred');
    if (datasetReference.toString() !== txDatasetReference.toString()) throw new Error('wrong dataset reference');
    if (APP_REFERENCE.toString() !== txAppReference.toString()) throw new Error('wrong app reference');
    if (seller.toString() !== dataset.owner) throw new Error('wrong seller');

    const payment = {
        signature,
        datasetId,
        datasetName: dataset.name,
        signer,
        seller,
        currency: mint.toBase58(),
        amount: amount.toString(16),
        timestamp: new Date().toISOString(),
    };
    const permissionHashes = await grantPermission(payment, dataset.timeseriesIDs);
    const transaction = { ...payment, permissionHashes };

    saveTransaction(transaction);

    return transaction;
}

async function fetchTransaction(signature: string) {
    const retryDelay = 400;
    const response = await config.RPC.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (response) {
        return response;
    } else {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchTransaction(signature);
    }
}