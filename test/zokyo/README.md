# Zokyo Standard tests

## Setup

### Install dependencies

```bash
npm i ethereum-waffle
npm i @defi-wonderland/smock
```

### Run test

```bash
npx hardhat test test/zokyo/testTokenManager.js
```

## Run coverage

```bash
npx hardhat coverage --testfiles "test/zokyo/test*.js" --solcoverjs test/zokyo/.solcover.js

npx hardhat coverage --testfiles "test/zokyo/testTokenManager.js" --solcoverjs test/zokyo/.solcover.js

```

## Fuzzing

```bash


docker run -it -p 8545:8545 -v "$PWD":/home/etheno/workspace trailofbits/etheno:v0.3a1
cd workspace
etheno --ganache --ganache-args="--miner.blockGasLimit 10000000" -x initTokenManager.json
npx truffle test test/stage1/tokenManagerDeployer.js --network develop

docker run -it -v "$PWD":/home/training trailofbits/eth-security-toolbox
solc-select install 0.8.15
solc-select use 0.8.15

solc-select install 0.7.6
solc-select use 0.7.6


echidna-test . --contract TestTokenManager --config config.yml
```
