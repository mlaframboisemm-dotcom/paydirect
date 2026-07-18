/**
 * Wise API Direct Debit / Pay-In Engine
 * Handles direct bank debits into Wise Business Account balance
 * Uses personal API token authentication for SMB account automation
 */

import crypto from 'crypto';
import { createStructuredLogger } from './structured-logger.js';

const logger = createStructuredLogger('wise-api-engine');

export interface WiseRecipientPayload {
  amount: number;
  currency: string;
  recipientName: string;
  routingNumber: string;
  accountNumber: string;
  accountType?: 'CHECKING' | 'SAVINGS';
}

export interface WiseTransferStatus {
  id: string;
  status: 'incoming_payment_waiting' | 'processing' | 'outgoing_payment_sent' | 'cancelled' | 'rejected';
  amount: number;
  currency: string;
  createdAt: string;
}

/**
 * Pure API Wise Connector
 * Interacts directly with Wise REST API for profile identification,
 * recipient creation, transfer routing, and active polling
 */
export class WiseApiEngine {
  private token: string;
  private baseUrl: string;
  private headers: Record<string, string>;
  private isSandbox: boolean;

  /**
   * @param {string} apiToken - Your Wise personal API token
   * @param {boolean} isSandbox - Toggle between Wise sandbox or live money URLs
   */
  constructor(apiToken: string, isSandbox: boolean = true) {
    if (!apiToken || apiToken.trim().length === 0) {
      throw new Error('Wise API token is required and cannot be empty');
    }

    this.token = apiToken;
    this.isSandbox = isSandbox;
    this.baseUrl = isSandbox
      ? 'https://api.sandbox.wise.com'
      : 'https://api.wise.com';

    this.headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SovereignsWiseIntegration/1.0'
    };

    logger.info('Wise API Engine initialized', {
      mode: isSandbox ? 'sandbox' : 'production',
      baseUrl: this.baseUrl
    });
  }

  /**
   * Fetches the corporate profile container ID from your token account
   * @returns Profile ID for use in subsequent API calls
   */
  async getProfileId(): Promise<string> {
    logger.debug('Fetching Wise profile ID');

    try {
      const response = await fetch(`${this.baseUrl}/v1/profiles`, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to fetch profiles', {
          status: response.status,
          error
        });
        throw new Error(`Wise profiles fetch failed: ${error.message || response.statusText}`);
      }

      const profiles = await response.json();

      // Find business profile
      const business = profiles.find((p: any) => p.type === 'business');
      if (!business) {
        logger.error('No business profile found', { profileCount: profiles.length });
        throw new Error('No active Business Profile linked to this token');
      }

      logger.debug('Business profile found', { profileId: business.id });
      return business.id;
    } catch (err: any) {
      logger.error('Error fetching profile ID', { error: err.message });
      throw err;
    }
  }

  /**
   * Creates a recipient bank account entry in Wise
   * @param profileId - Your Wise profile ID
   * @param payload - Recipient bank details
   * @returns Recipient ID for use in transfer routing
   */
  async createRecipient(profileId: string, payload: WiseRecipientPayload): Promise<string> {
    logger.debug('Creating Wise recipient', {
      currency: payload.currency,
      accountType: payload.accountType || 'CHECKING'
    });

    try {
      const recipientPayload = {
        profile: profileId,
        currency: payload.currency,
        type: 'aba', // US ACH routing
        accountHolderName: payload.recipientName,
        details: {
          routingNumber: payload.routingNumber,
          accountNumber: payload.accountNumber,
          accountType: payload.accountType || 'CHECKING'
        }
      };

      const response = await fetch(`${this.baseUrl}/v1/recipients`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(recipientPayload)
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Recipient creation failed', {
          status: response.status,
          error
        });
        throw new Error(`Recipient creation rejected: ${error.message || response.statusText}`);
      }

      const data = await response.json();
      logger.debug('Recipient created successfully', { recipientId: data.id });
      return data.id;
    } catch (err: any) {
      logger.error('Error creating recipient', { error: err.message });
      throw err;
    }
  }

  /**
   * Executes a complete direct debit transaction
   * Pulls funds from external account and deposits into your Wise balance
   * @param ledgerId - Your ledger transaction ID (for audit trail)
   * @param payload - Transaction details with recipient bank info
   * @returns Wise transfer ID for status tracking
   */
  async executeDirectDebit(ledgerId: string, payload: WiseRecipientPayload): Promise<string> {
    logger.info('Executing direct debit transaction', {
      ledgerId,
      amount: payload.amount,
      currency: payload.currency
    });

    try {
      // Step 1: Get profile ID
      const profileId = await this.getProfileId();

      // Step 2: Create recipient entry
      const recipientId = await this.createRecipient(profileId, payload);

      // Step 3: Generate inbound funding quote
      logger.debug('Generating funding quote');
      const quoteResponse = await fetch(`${this.baseUrl}/v3/profiles/${profileId}/quotes`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          sourceCurrency: payload.currency,
          targetCurrency: payload.currency,
          targetAmount: payload.amount,
          profile: profileId,
          payInMethod: 'DIRECT_DEBIT'
        })
      });

      if (!quoteResponse.ok) {
        const error = await quoteResponse.json();
        logger.error('Quote generation failed', { error });
        throw new Error(`Quote generation failed: ${error.message || quoteResponse.statusText}`);
      }

      const quote = await quoteResponse.json();
      logger.debug('Quote generated', { quoteId: quote.id, rate: quote.rate });

      // Step 4: Create transfer object
      logger.debug('Creating transfer object');
      const transferResponse = await fetch(`${this.baseUrl}/v1/transfers`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          targetAccount: recipientId,
          quoteUuid: quote.id,
          customerTransactionId: crypto.randomUUID() // Enforces idempotency
        })
      });

      if (!transferResponse.ok) {
        const error = await transferResponse.json();
        logger.error('Transfer creation failed', { error });
        throw new Error(`Transfer creation failed: ${error.message || transferResponse.statusText}`);
      }

      const transfer = await transferResponse.json();
      logger.debug('Transfer created', { transferId: transfer.id });

      // Step 5: Fund the transfer with DIRECT_DEBIT instruction
      logger.debug('Funding transfer with direct debit');
      const fundResponse = await fetch(
        `${this.baseUrl}/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            type: 'DIRECT_DEBIT',
            paymentMethodDetails: {
              routingNumber: payload.routingNumber,
              accountNumber: payload.accountNumber,
              accountHolderName: payload.recipientName,
              accountType: payload.accountType || 'CHECKING'
            }
          })
        }
      );

      if (!fundResponse.ok) {
        const error = await fundResponse.json();
        logger.error('Direct debit funding failed', {
          transferId: transfer.id,
          error
        });
        throw new Error(`Direct debit funding failed: ${error.message || fundResponse.statusText}`);
      }

      logger.info('Direct debit transaction initiated successfully', {
        ledgerId,
        transferId: transfer.id,
        amount: payload.amount
      });

      return transfer.id;
    } catch (err: any) {
      logger.error('Direct debit execution failed', {
        ledgerId,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Creates an outbound recipient (for sending money OUT)
   * Supports global bank accounts and multiple currencies
   * @param profileId - Your Wise profile ID
   * @param recipientName - Name on the bank account
   * @param currency - Target currency
   * @param bankDetails - Bank account routing/account info (varies by country)
   * @returns Recipient ID for outbound transfers
   */
  async createOutboundRecipient(
    profileId: string,
    recipientName: string,
    currency: string,
    bankDetails: Record<string, any>
  ): Promise<string> {
    logger.debug('Creating outbound recipient', {
      currency,
      recipientName
    });

    try {
      const recipientPayload = {
        profile: profileId,
        currency,
        type: 'aba', // Default to US ABA, can be extended for other formats
        accountHolderName: recipientName,
        details: bankDetails
      };

      const response = await fetch(`${this.baseUrl}/v1/recipients`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(recipientPayload)
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Outbound recipient creation failed', {
          status: response.status,
          error
        });
        throw new Error(`Outbound recipient creation failed: ${error.message || response.statusText}`);
      }

      const data = await response.json();
      logger.debug('Outbound recipient created', { recipientId: data.id });
      return data.id;
    } catch (err: any) {
      logger.error('Error creating outbound recipient', { error: err.message });
      throw err;
    }
  }

  /**
   * Executes a complete outbound transfer
   * Sends funds FROM your Wise balance TO a recipient bank account
   * Supports global recipients and multi-currency
   * @param ledgerId - Your ledger transaction ID (for audit trail)
   * @param amount - Amount to send
   * @param sourceCurrency - Currency in your Wise balance
   * @param targetCurrency - Currency the recipient receives
   * @param recipientName - Recipient bank account name
   * @param bankDetails - Bank routing/account details
   * @returns Wise transfer ID for tracking
   */
  async executeOutboundTransfer(
    ledgerId: string,
    amount: number,
    sourceCurrency: string,
    targetCurrency: string,
    recipientName: string,
    bankDetails: Record<string, any>
  ): Promise<string> {
    logger.info('Executing outbound transfer', {
      ledgerId,
      amount,
      sourceCurrency,
      targetCurrency,
      recipientName
    });

    try {
      // Step 1: Get profile ID
      const profileId = await this.getProfileId();

      // Step 2: Create outbound recipient
      const recipientId = await this.createOutboundRecipient(
        profileId,
        recipientName,
        targetCurrency,
        bankDetails
      );

      // Step 3: Get outbound transfer quote
      logger.debug('Getting outbound transfer quote');
      const quoteResponse = await fetch(`${this.baseUrl}/v3/profiles/${profileId}/quotes`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          sourceCurrency,
          targetCurrency,
          sourceAmount: amount,
          profile: profileId
        })
      });

      if (!quoteResponse.ok) {
        const error = await quoteResponse.json();
        logger.error('Outbound quote generation failed', { error });
        throw new Error(`Quote generation failed: ${error.message || quoteResponse.statusText}`);
      }

      const quote = await quoteResponse.json();
      logger.debug('Outbound quote generated', {
        quoteId: quote.id,
        rate: quote.rate,
        targetAmount: quote.targetAmount,
        fee: quote.fee
      });

      // Step 4: Create outbound transfer
      logger.debug('Creating outbound transfer');
      const transferResponse = await fetch(`${this.baseUrl}/v1/transfers`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          targetAccount: recipientId,
          quoteUuid: quote.id,
          customerTransactionId: crypto.randomUUID()
        })
      });

      if (!transferResponse.ok) {
        const error = await transferResponse.json();
        logger.error('Outbound transfer creation failed', { error });
        throw new Error(`Transfer creation failed: ${error.message || transferResponse.statusText}`);
      }

      const transfer = await transferResponse.json();
      logger.debug('Outbound transfer created', { transferId: transfer.id });

      // Step 5: Fund the transfer from Wise balance
      logger.debug('Funding outbound transfer from Wise balance');
      const fundResponse = await fetch(
        `${this.baseUrl}/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            type: 'BALANCE'
          })
        }
      );

      if (!fundResponse.ok) {
        const error = await fundResponse.json();
        logger.error('Outbound transfer funding failed', {
          transferId: transfer.id,
          error
        });
        throw new Error(`Transfer funding failed: ${error.message || fundResponse.statusText}`);
      }

      logger.info('Outbound transfer initiated successfully', {
        ledgerId,
        transferId: transfer.id,
        amount,
        sourceCurrency,
        targetCurrency
      });

      return transfer.id;
    } catch (err: any) {
      logger.error('Outbound transfer execution failed', {
        ledgerId,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Polls the live status of an active transfer
   * @param transferId - Wise transfer ID to check
   * @returns Current transfer status
   */
  async checkTransferStatus(transferId: string): Promise<WiseTransferStatus> {
    logger.debug('Checking transfer status', { transferId });

    try {
      const response = await fetch(`${this.baseUrl}/v1/transfers/${transferId}`, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Transfer status check failed', {
          transferId,
          status: response.status,
          error
        });
        throw new Error(`Transfer status check failed: ${error.message || response.statusText}`);
      }

      const transferDetails = await response.json();

      logger.debug('Transfer status retrieved', {
        transferId,
        status: transferDetails.status
      });

      return {
        id: transferDetails.id,
        status: transferDetails.status,
        amount: transferDetails.amount,
        currency: transferDetails.currency,
        createdAt: transferDetails.createdAt
      };
    } catch (err: any) {
      logger.error('Error checking transfer status', {
        transferId,
        error: err.message
      });
      throw err;
    }
  }
}

export default WiseApiEngine;
