import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { MINT_DECIMALS, TEN, USDC_MINT } from '../constants';
import BigNumber from 'bignumber.js';
import { config } from '../config';

export async function createTransferInstruction(
  recipient: PublicKey,
  amount: BigNumber,
  sender: PublicKey,
): Promise<TransactionInstruction> {
  const USDC_DECIMALS = MINT_DECIMALS['USDC'];
  // Convert input decimal amount to integer tokens according to the mint decimals
  amount = amount.times(TEN.pow(MINT_DECIMALS['USDC'])).integerValue(BigNumber.ROUND_FLOOR);

  // Get the sender's ATA and check that the account exists and can send tokens
  const senderATA = await getAssociatedTokenAddress(USDC_MINT, sender);
  const senderAccount = await getAccount(config.RPC, senderATA);
  if (!senderAccount.isInitialized) throw new Error('Sender not initialized');
  if (senderAccount.isFrozen) throw new Error('Sender frozen');

  // Get the recipient's ATA and check that the account exists and can receive tokens
  const recipientATA = await getAssociatedTokenAddress(USDC_MINT, recipient);
  const recipientAccount = await getAccount(config.RPC, recipientATA);
  if (!recipientAccount.isInitialized) throw new Error('Recipient not initialized');
  if (recipientAccount.isFrozen) throw new Error('Recipient frozen');

  // Check that the sender has enough tokens
  const tokens = BigInt(String(amount));
  if (tokens > senderAccount.amount) throw new Error('Insufficient funds');

  // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
  return createTransferCheckedInstruction(senderATA, USDC_MINT, recipientATA, sender, tokens, USDC_DECIMALS);
}