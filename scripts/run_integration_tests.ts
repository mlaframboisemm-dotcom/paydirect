import { ethers } from 'ethers';

const BASE_URL = 'http://localhost:3000';
const ETH_RPC_URL = 'https://ethereum-rpc.publicnode.com';
const DUMMY_TO_ADDRESS = '0x58B178F7EEe92fe888c0A1684D5FE6b78C0Ff99f';

async function runSigningPipelineTest() {
  console.log('\n--- [TEST 1] CRYPTOGRAPHIC SIGNING PIPELINE ---');
  const wallet = ethers.Wallet.createRandom();
  console.log(`Generated Ephemeral Testing Address: ${wallet.address}`);
  
  const txRequest = {
    to: DUMMY_TO_ADDRESS,
    value: ethers.parseEther('0.05'),
    gasLimit: 21000,
    gasPrice: ethers.parseUnits('20', 'gwei'),
    nonce: 0,
    chainId: 1
  };
  
  console.log('Signing mock transaction payload...');
  const signedTx = await wallet.signTransaction(txRequest);
  const parsedTx = ethers.Transaction.from(signedTx);
  console.log(`Parsed Signer Address from Payload: ${parsedTx.from}`);
  
  if (parsedTx.from?.toLowerCase() === wallet.address.toLowerCase()) {
    console.log('✅ SUCCESS: Cryptographic signature verified successfully!');
  } else {
    throw new Error('Signer address mismatch.');
  }
}

async function runLiveBlockchainBroadcastTest() {
  console.log('\n--- [TEST 2] LIVE ON-CHAIN BROADCAST / GAS COST CHECK ---');
  const wallet = ethers.Wallet.createRandom();
  const provider = new ethers.JsonRpcProvider(ETH_RPC_URL, undefined, { staticNetwork: true });
  const connectedWallet = wallet.connect(provider);
  
  const gasPrice = await provider.getFeeData().then(f => f.gasPrice || ethers.parseUnits('20', 'gwei'));
  const tx = {
    to: DUMMY_TO_ADDRESS,
    value: ethers.parseEther('0.0001'),
    gasLimit: 21000,
    gasPrice
  };
  
  console.log(`Sending signed transaction to live Ethereum network: ${ETH_RPC_URL}`);
  try {
    const txResponse = await connectedWallet.sendTransaction(tx);
    console.log(`Tx broadcasted successfully! Hash: ${txResponse.hash}`);
  } catch (err: any) {
    if (err.message.includes('insufficient funds') || err.code === 'INSUFFICIENT_FUNDS') {
      console.log('✅ SUCCESS: Mainnet node verified the transaction and rejected it only due to 0 ETH gas.');
    } else {
      throw new Error(`Unexpected live RPC rejection: ${err.message}`);
    }
  }
}

async function runGatewayClearanceTest(operationType: 'DEPOSIT' | 'WITHDRAWAL') {
  console.log(`\n--- [TEST ${operationType === 'DEPOSIT' ? '3' : '4'}] INTERBANK GATEWAY ${operationType} LOOP ---`);
  
  console.log(`Initiating outbound ${operationType} e-Transfer session...`);
  const initiateRes = await fetch(`${BASE_URL}/api/v1/interac/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation_type: operationType,
      recipient_email: 'iamamwaystheoneone@gmail.com',
      amount_cad: 750.00
    })
  });
  
  if (!initiateRes.ok) {
    throw new Error(`Session initiation failed: ${initiateRes.statusText}`);
  }
  
  const session = await initiateRes.json() as any;
  console.log(`Session Provisioned! Transfer ID: ${session.transfer_id}`);
  
  console.log('Requesting secure FAPI bank auth redirect URL...');
  const authUrlRes = await fetch(`${BASE_URL}/api/v1/interac/oauth-url/TD?transfer_id=${session.transfer_id}`);
  if (!authUrlRes.ok) {
    throw new Error(`Failed to request auth URL: ${authUrlRes.statusText}`);
  }
  const authData = await authUrlRes.json() as any;
  console.log(`Target Redirect URL: ${authData.target_redirect_url}`);
  
  console.log('Simulating bank authorization callback...');
  const callbackRes = await fetch(`${BASE_URL}/api/v1/interac/callback?transfer_id=${session.transfer_id}&code=auth_code_mock_789`);
  if (!callbackRes.ok) {
    throw new Error(`Callback failed: ${callbackRes.statusText}`);
  }
  
  console.log('Finalizing clearinghouse settlement...');
  const finalizeRes = await fetch(`${BASE_URL}/api/v1/interac/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transfer_id: session.transfer_id,
      selected_bank_key: 'TD',
      oauth_authorization_token: 'auth_token_mock_val_789'
    })
  });
  
  if (!finalizeRes.ok) {
    const errBody = await finalizeRes.json() as any;
    throw new Error(`Finalization failed: ${JSON.stringify(errBody)}`);
  }
  
  const settlement = await finalizeRes.json() as any;
  console.log('Settlement Complete!');
  console.log(`Clearinghouse Status: ${settlement.status}`);
  console.log(`Audited Reference ID: ${settlement.clearing_reference_id}`);
  console.log(`✅ SUCCESS: ${operationType} cleared successfully!`);
}

async function runAllTests() {
  console.log('====================================================');
  console.log('   SOVEREIGN WEALTH TERMINAL INTEGRATION TESTS');
  console.log('====================================================');
  
  try {
    await runSigningPipelineTest();
    await runLiveBlockchainBroadcastTest();
    await runGatewayClearanceTest('DEPOSIT');
    await runGatewayClearanceTest('WITHDRAWAL');
    console.log('\n====================================================');
    console.log('🎉 ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (e: any) {
    console.error('\n❌ INTEGRATION TEST FAILED:', e.message);
    process.exit(1);
  }
}

runAllTests();
