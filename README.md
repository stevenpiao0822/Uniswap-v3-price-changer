# Uniswap V3 Pool Price Update Experiment

This project experiments how to change exchange rate of given Uniswap v3 pool to target rate.

In the experiment, 2 mock tokens are deployed and a new pool is created for the 2 tokens.

Pool's initial rate is 1. (1 Token1 = 1 Token0)

Liquidity is added in several random tick ranges.

There are 2 test cases - one for changing rate to 1.5, one for chainging rate to 0.66.

Execute below command to run tests. 

```shell
npx hardhat test
```
