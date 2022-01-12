# Arbitragoor

Scripts to execute arbitrage requests.

## Build

```
yarn
yarn build
```

## Run

Update `.env` with the desired configuration, then run:
```
yarn start
```

## Docker

```
docker build . -t arbitragoor
docker run --env-file=.env arbitragoor:latest
```

## Contract lifecycle

Withdraw any funds from the contract
```
yarn withdraw
```

Update the flashloan keeper
```
yarn change-keeper 0x000newkeeperaddress000...
```
