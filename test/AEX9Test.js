import { assert } from 'chai';
import { utils } from '@aeternity/aeproject';
import { Contract, getFileSystem } from '@aeternity/aepp-sdk';

const FUNGIBLE_TOKEN_FULL_SOURCE = './contracts/AEX9.aes';

describe('Fungible Token Full Contract', () => {
  let aeSdk;
  let contract;

  before(async () => {
    aeSdk = utils.getSdk({});
    // a filesystem object must be passed to the compiler if the contract uses custom includes
    const fileSystem = await getFileSystem(FUNGIBLE_TOKEN_FULL_SOURCE);

    // get content of contract
    const sourceCode = utils.getContractContent(FUNGIBLE_TOKEN_FULL_SOURCE);

    // initialize the contract instance
    contract = await Contract.initialize({
      ...aeSdk.getContext(),
      sourceCode,
      fileSystem,
    });
    await contract.init('AE Test Token', 0, 'AETT');

    // create a snapshot of the blockchain state
    await utils.createSnapshot(aeSdk);
  });

  // after each test roll back to initial state
  afterEach(async () => {
    await utils.rollbackSnapshot(aeSdk);
  });

  it('Fungible Token Contract: Return Extensions', async () => {
    const aex9Extensions = await contract.aex9_extensions();
    assert.deepEqual(
      aex9Extensions.decodedResult,
      ['allowances', 'mintable', 'burnable', 'swappable'],
      'Contract extensions did not match.'
    );
  });

  it('Deploying Fungible Token Contract: Meta Information', async () => {
    const initializeNewTokenContract = async () => {
      const fileSystem = await getFileSystem(FUNGIBLE_TOKEN_FULL_SOURCE);

      // get content of contract
      const sourceCode = utils.getContractContent(FUNGIBLE_TOKEN_FULL_SOURCE);

      // initialize the contract instance
      return Contract.initialize({
        ...aeSdk.getContext(),
        sourceCode,
        fileSystem,
      });
    };

    const testContract = await initializeNewTokenContract();
    const deployTestContract = await testContract.init(
      'AE Test Token',
      0,
      'AETT'
    );
    assert.equal(
      deployTestContract.result.returnType,
      'ok',
      'Contract was not deployed.'
    );
    const metaInfo = await testContract.meta_info();
    assert.deepEqual(
      metaInfo.decodedResult,
      {
        name: 'AE Test Token',
        symbol: 'AETT',
        decimals: 0n,
      },
      'Meta info does not match.'
    );

    const decimalContract = await initializeNewTokenContract();
    const deployDecimals = await decimalContract.init(
      'AE Test Token',
      10,
      'AETT'
    );
    assert.equal(
      deployDecimals.result.returnType,
      'ok',
      'Contract was not deployed.'
    );
    const metaInfoDecimals = await decimalContract.meta_info();
    assert.deepEqual(
      metaInfoDecimals.decodedResult,
      {
        name: 'AE Test Token',
        symbol: 'AETT',
        decimals: 10n,
      },
      'Meta info does not match.'
    );

    const newContract = await initializeNewTokenContract();
    const deployFail = await newContract
      .init('AE Test Token', -10, 'AETT')
      .catch((e) => e);
    assert.include(deployFail.message, 'NON_NEGATIVE_VALUE_REQUIRED');
  });

  it('Fungible Token Contract: Mint Tokens', async () => {
    const mint = await contract.mint(utils.getDefaultAccounts()[0].address, 10);
    assert.equal(mint.decodedEvents[0].name, 'Mint');
    assert.equal(
      mint.decodedEvents[0].args[0],
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(mint.decodedEvents[0].args[1], 10);
    assert.equal(mint.result.returnType, 'ok');

    const totalSupply = await contract.total_supply();
    assert.equal(totalSupply.decodedResult, 10);

    const balance = await contract.balance(
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(balance.decodedResult, 10);

    const mintFailAmount = await contract
      .mint(utils.getDefaultAccounts()[0].address, -10)
      .catch((e) => e);
    assert.include(mintFailAmount.message, 'NON_NEGATIVE_VALUE_REQUIRED');

    const mintFailOwner = await contract
      .mint(utils.getDefaultAccounts()[1].address, 10, {
        onAccount: utils.getDefaultAccounts()[1],
      })
      .catch((e) => e);
    assert.include(mintFailOwner.message, 'ONLY_OWNER_CALL_ALLOWED');
  });

  it('Fungible Token Contract: Burn Tokens', async () => {
    await contract.mint(utils.getDefaultAccounts()[0].address, 10);

    const burn = await contract.burn(5);
    assert.equal(burn.decodedEvents[0].name, 'Burn');
    assert.equal(
      burn.decodedEvents[0].args[0],
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(burn.decodedEvents[0].args[1], 5);
    assert.equal(burn.result.returnType, 'ok');

    const totalSupply = await contract.total_supply();
    assert.equal(totalSupply.decodedResult, 5);
    const balance = await contract.balance(
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(balance.decodedResult, 5);

    const burnFailAmount = await contract.burn(-10).catch((e) => e);
    assert.include(burnFailAmount.message, 'NON_NEGATIVE_VALUE_REQUIRED');
  });

  it('Fungible Token Contract: Create Allowance', async () => {
    const create_allowance = await contract.create_allowance(
      utils.getDefaultAccounts()[1].address,
      10
    );
    assert.equal(create_allowance.decodedEvents[0].name, 'Allowance');
    assert.equal(
      create_allowance.decodedEvents[0].args[0],
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(
      create_allowance.decodedEvents[0].args[1],
      utils.getDefaultAccounts()[1].address
    );
    assert.equal(create_allowance.decodedEvents[0].args[2], 10);
    assert.equal(create_allowance.result.returnType, 'ok');

    const allowanceFailAmount = await contract
      .create_allowance(utils.getDefaultAccounts()[1].address, -10)
      .catch((e) => e);
    assert.include(allowanceFailAmount.message, 'NON_NEGATIVE_VALUE_REQUIRED');
  });

  it('Fungible Token Contract: Get Allowance', async () => {
    await contract.create_allowance(utils.getDefaultAccounts()[1].address, 10);

    const get_allowance = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[1].address,
    });
    assert.equal(get_allowance.decodedResult, 10);

    const allowance_for_caller = await contract.allowance_for_caller(
      utils.getDefaultAccounts()[0].address,
      { onAccount: utils.getDefaultAccounts()[1] }
    );
    assert.equal(allowance_for_caller.decodedResult, 10);

    const allowances = await contract.allowances();
    assert.deepEqual(Array.from(allowances.decodedResult), [
      [
        {
          from_account: utils.getDefaultAccounts()[0].address,
          for_account: utils.getDefaultAccounts()[1].address,
        },
        10n,
      ],
    ]);
  });

  it('Fungible Token Contract: Increase Allowance', async () => {
    await contract.create_allowance(utils.getDefaultAccounts()[1].address, 10);

    await contract
      .change_allowance(utils.getDefaultAccounts()[1].address, 10)
      .catch((e) => e);

    const get_allowance_after = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[1].address,
    });
    assert.equal(get_allowance_after.decodedResult, 20);
  });

  it('Fungible Token Contract: Decrease Allowance', async () => {
    await contract.create_allowance(utils.getDefaultAccounts()[1].address, 10);

    await contract.change_allowance(utils.getDefaultAccounts()[1].address, -5);

    const get_allowance_after = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[1].address,
    });
    assert.equal(get_allowance_after.decodedResult, 5);
  });

  it('Fungible Token Contract: Transfer Allowance', async () => {
    await contract.mint(utils.getDefaultAccounts()[0].address, 10);
    await contract.create_allowance(utils.getDefaultAccounts()[1].address, 10);

    await contract.transfer_allowance(
      utils.getDefaultAccounts()[0].address,
      utils.getDefaultAccounts()[1].address,
      5,
      { onAccount: utils.getDefaultAccounts()[1] }
    );
    const get_allowance_after = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[1].address,
    });
    assert.equal(get_allowance_after.decodedResult, 5);

    const balances = await contract.balances();
    assert.deepEqual(Array.from(balances.decodedResult), [
      [utils.getDefaultAccounts()[0].address, 5n],
      [utils.getDefaultAccounts()[1].address, 5n],
    ]);
  });

  it('Fungible Token Contract: Transfer Allowance (should fail)', async () => {
    const allowanceFailBalance = await contract
      .transfer_allowance(
        utils.getDefaultAccounts()[0].address,
        utils.getDefaultAccounts()[1].address,
        15
      )
      .catch((e) => e);
    assert.include(
      allowanceFailBalance.message,
      'BALANCE_ACCOUNT_NOT_EXISTENT'
    );

    await contract.mint(utils.getDefaultAccounts()[0].address, 15);
    const allowanceFailExistence = await contract
      .transfer_allowance(
        utils.getDefaultAccounts()[0].address,
        utils.getDefaultAccounts()[1].address,
        15
      )
      .catch((e) => e);
    assert.include(allowanceFailExistence.message, 'ALLOWANCE_NOT_EXISTENT');

    await contract.create_allowance(utils.getDefaultAccounts()[0].address, 10);

    const allowanceFailAmount = await contract
      .transfer_allowance(
        utils.getDefaultAccounts()[0].address,
        utils.getDefaultAccounts()[1].address,
        15
      )
      .catch((e) => e);
    assert.include(allowanceFailAmount.message, 'NON_NEGATIVE_VALUE_REQUIRED');

    const get_allowance_after = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[0].address,
    });
    assert.equal(get_allowance_after.decodedResult, 10);
  });

  it('Fungible Token Contract: Decrease Allowance below zero (should fail)', async () => {
    await contract.create_allowance(utils.getDefaultAccounts()[1].address, 10);

    const change_allowance = await contract
      .change_allowance(utils.getDefaultAccounts()[1].address, -11)
      .catch((e) => e);
    assert.include(change_allowance.message, 'NON_NEGATIVE_VALUE_REQUIRED');

    const get_allowance_after = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[1].address,
    });
    assert.equal(get_allowance_after.decodedResult, 10);
  });

  it('Fungible Token Contract: Reset Allowance', async () => {
    await contract.create_allowance(utils.getDefaultAccounts()[1].address, 10);

    await contract
      .reset_allowance(utils.getDefaultAccounts()[1].address)
      .catch((e) => e);

    const get_allowance_after = await contract.allowance({
      from_account: utils.getDefaultAccounts()[0].address,
      for_account: utils.getDefaultAccounts()[1].address,
    });
    assert.equal(get_allowance_after.decodedResult, 0);
  });

  it('Fungible Token Contract: Swap', async () => {
    await contract.mint(utils.getDefaultAccounts()[0].address, 10);

    const total_supply = await contract.total_supply();
    assert.equal(total_supply.decodedResult, 10);
    const swap = await contract.swap();
    assert.equal(swap.decodedEvents[0].name, 'Swap');
    assert.equal(
      swap.decodedEvents[0].args[0],
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(swap.decodedEvents[0].args[1], 10);

    const check_swap = await contract.check_swap(
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(check_swap.decodedResult, 10);
    const balance = await contract.balance(
      utils.getDefaultAccounts()[0].address
    );
    assert.equal(balance.decodedResult, 0);

    const total_supply_after = await contract.total_supply();
    assert.equal(total_supply_after.decodedResult, 0);

    const swapped = await contract.swapped();
    assert.deepEqual(Array.from(swapped.decodedResult), [
      [utils.getDefaultAccounts()[0].address, 10n],
    ]);
  });

  it('Fungible Token Contract: Quickcheck Discovery 2: 0 Allowance X Transfer', async () => {
    const total_supply = await contract.total_supply();
    assert.equal(total_supply.decodedResult, 0);

    const create_allowance = await contract.create_allowance(
      utils.getDefaultAccounts()[0].address,
      0
    );
    assert.equal(create_allowance.result.returnType, 'ok');

    // This would then return the error NON_NEGATIVE_VALUE_REQUIRED which didn't make sense in the case
    const transfer_allowance = await contract
      .transfer_allowance(
        utils.getDefaultAccounts()[0].address,
        utils.getDefaultAccounts()[0].address,
        10
      )
      .catch((e) => e);
    assert.include(transfer_allowance.message, 'BALANCE_ACCOUNT_NOT_EXISTENT');
  });
});
