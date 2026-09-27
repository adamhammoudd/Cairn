# Coverage sweep - after

Commit `b6ef75b`, seed 20260927, run 2026-09-27T16:27:52.243Z. Pipeline: `generateForScope`. Production data read-only, model mocked (text from Cairn's template).

**100.0%** of sampled symbols with a year or more of prices produced an analysis (79 of 79). Target: 95%.

| Asset type | Sampled | Produced | With >= 1 year of prices | Produced (of those) | Rate |
|---|---|---|---|---|---|
| equity | 60 | 52 | 50 | 50 | 100.0% |
| etf | 15 | 8 | 8 | 8 | 100.0% |
| coin | 40 | 21 | 21 | 21 | 100.0% |
| **all** | 115 | 81 | 79 | 79 | **100.0%** |

## Failures (34)

| Symbol | Stratum | Bars | Legitimate? | What the reader saw | Reason / detail |
|---|---|---|---|---|---|
| QETAR | equity: small | 1 | only 1 days of history (under a year) | Quetta Acquisition has only 1 trading day of price history, too new to compare with its own past. | short_history |
| ENRD | equity: small | 75 | only 75 days of history (under a year) | Einride AB has only 75 trading days of price history, too new to compare with its own past. | short_history |
| HNAMY | equity: small | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| ATLQW | equity: small | 1 | only 1 days of history (under a year) | JAB Acquisition Corp I has only 1 trading day of price history, too new to compare with its own past. | short_history |
| CLBR-WT | equity: small | 1 | only 1 days of history (under a year) | Colombier Acquisition Corp. III has only 1 trading day of price history, too new to compare with its own past. | short_history |
| AELKY | equity: small | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| TAWN | equity: small | 26 | only 26 days of history (under a year) | Bank OF Montreal has only 26 trading days of price history, too new to compare with its own past. | short_history |
| ARTC | equity: small | 146 | only 146 days of history (under a year) | Art Technology Acquisition has only 146 trading days of price history, too new to compare with its own past. | short_history |
| TKNZ | etf | 51 | only 51 days of history (under a year) | T. Rowe Price Active Crypto ETF has only 51 trading days of price history, too new to compare with its own past. | short_history |
| GXRP | etf | 210 | only 210 days of history (under a year) | Grayscale XRP Trust ETF has only 210 trading days of price history, too new to compare with its own past. | short_history |
| VBNB | etf | 83 | only 83 days of history (under a year) | VanEck BNB ETF has only 83 trading days of price history, too new to compare with its own past. | short_history |
| TDOG | etf | 171 | only 171 days of history (under a year) | 21Shares Dogecoin ETF has only 171 trading days of price history, too new to compare with its own past. | short_history |
| GSUI | etf | 157 | only 157 days of history (under a year) | Grayscale Sui Staking ETF has only 157 trading days of price history, too new to compare with its own past. | short_history |
| ETHB | etf | 137 | only 137 days of history (under a year) | iShares Staked Ethereum Trust ETF has only 137 trading days of price history, too new to compare with its own past. | short_history |
| TSOL | etf | 213 | only 213 days of history (under a year) | 21Shares Solana Staking ETF has only 213 trading days of price history, too new to compare with its own past. | short_history |
| USDGO | coin: top 100 | 207 | only 207 days of history (under a year) | Usdgo has only 207 days of price history, too new to compare with its own past. | short_history |
| RHIMX | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| MAG7XON | coin: long tail | 5 | only 5 days of history (under a year) | Ondo Magnificent 7 and Crypto Portfolio has only 5 days of price history, too new to compare with its own past. | short_history |
| GATSBY | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| ROIH | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| ARM-WETH-STETH | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| RWEC | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| RCFG | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| URA | coin: long tail | 202 | only 202 days of history (under a year) | Global X Uranium ETF (Backpack Securities) has only 202 days of price history, too new to compare with its own past. | short_history |
| IRENX | coin: long tail | 67 | only 67 days of history (under a year) | IREN xStock has only 67 days of price history, too new to compare with its own past. | short_history |
| PINGO | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| SIGNET | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| RMFC | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| PATHUSD | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| SAVIOUR | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| WNUSDT0 | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| BFX | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| COMPANY | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |
| AXLUSDT | coin: long tail | 0 | provider has no data for this symbol | We couldn't find market data for that ticker. Check the symbol for a typo - it may also be delisted or a type of instrument Cairn doesn't cover yet. | error |

## Every symbol

| Symbol | Stratum | Directory status | Bars | Result | History basis | Fallback | News cited | Data sources | Seconds |
|---|---|---|---|---|---|---|---|---|---|
| MO | equity: large | listed | 14305 | analysis | baseline |  | 0 | 3 | 70.2 |
| EONGY | equity: large | listed | 7286 | analysis | similar |  | 0 | 1 | 23.1 |
| ECL | equity: large | listed | 13513 | analysis | similar |  | 0 | 3 | 55.5 |
| ARM | equity: large | listed | 761 | analysis | similar |  | 0 | 1 | 6.6 |
| HTHIY | equity: large | listed | 11211 | analysis | similar |  | 0 | 1 | 40.1 |
| RBGLY | equity: large | listed | 4514 | analysis | similar |  | 0 | 1 | 13.3 |
| PDD | equity: large | listed | 2053 | analysis | similar |  | 0 | 1 | 7.0 |
| VRT | equity: large | listed | 2048 | analysis | similar |  | 0 | 3 | 7.9 |
| EQT | equity: large | listed | 11727 | analysis | similar |  | 0 | 3 | 41.7 |
| BSBR | equity: large | listed | 4268 | analysis | baseline |  | 0 | 1 | 13.0 |
| BE | equity: large | listed | 2054 | analysis | similar |  | 0 | 3 | 7.9 |
| FRFHF | equity: large | listed | 5979 | analysis | similar |  | 0 | 1 | 19.7 |
| AU | equity: large | listed | 7079 | analysis | similar |  | 0 | 1 | 22.0 |
| SCCO | equity: large | listed | 7731 | analysis | similar |  | 0 | 3 | 24.7 |
| COST | equity: large | listed | 10132 | analysis | similar |  | 0 | 3 | 34.6 |
| CMI | equity: large | listed | 13513 | analysis | similar |  | 0 | 3 | 50.8 |
| CRH | equity: large | listed | 9370 | analysis | similar |  | 0 | 3 | 31.4 |
| PCG | equity: large | listed | 13693 | analysis | similar |  | 0 | 3 | 51.9 |
| C | equity: large | listed | 12536 | analysis | similar |  | 0 | 3 | 45.7 |
| RCL | equity: large | listed | 8411 | analysis | similar |  | 0 | 3 | 29.0 |
| FIVN | equity: mid | listed | 3138 | analysis | similar |  | 0 | 3 | 12.1 |
| CATY | equity: mid | listed | 9009 | analysis | baseline |  | 0 | 3 | 29.8 |
| ALLY | equity: mid | listed | 3185 | analysis | similar |  | 0 | 3 | 10.4 |
| AKAM | equity: mid | listed | 6767 | analysis | similar |  | 0 | 3 | 21.4 |
| BATRA | equity: mid | listed | 2626 | analysis | similar |  | 0 | 3 | 8.3 |
| SOLS | equity: mid | listed | 235 | analysis | none |  | 0 | 3 | 2.5 |
| ROAD | equity: mid | listed | 2110 | analysis | similar |  | 0 | 3 | 7.9 |
| CNH | equity: mid | listed | 3267 | analysis | similar |  | 0 | 3 | 11.1 |
| AIR | equity: mid | listed | 11727 | analysis | similar |  | 0 | 3 | 41.5 |
| TTC | equity: mid | listed | 11727 | analysis | similar |  | 0 | 3 | 43.3 |
| HUT | equity: mid | listed | 2150 | analysis | similar |  | 0 | 3 | 9.1 |
| TPL | equity: mid | listed | 11727 | analysis | similar |  | 0 | 3 | 58.4 |
| BF-B | equity: mid | listed | 11727 | analysis | baseline |  | 0 | 3 | 41.4 |
| DIOD | equity: mid | listed | 13513 | analysis | similar |  | 0 | 3 | 65.0 |
| BLCO | equity: mid | listed | 1101 | analysis | baseline |  | 0 | 3 | 7.3 |
| BRKR | equity: mid | listed | 6574 | analysis | similar |  | 0 | 3 | 33.5 |
| MHO | equity: mid | listed | 8279 | analysis | similar |  | 0 | 3 | 38.9 |
| REXR | equity: mid | listed | 3317 | analysis | similar |  | 0 | 3 | 12.1 |
| KRC | equity: mid | listed | 7461 | analysis | baseline |  | 0 | 3 | 23.8 |
| HALO | equity: mid | listed | 5669 | analysis | similar |  | 0 | 3 | 16.9 |
| QETAR | equity: small | listed | 1 | failed |  |  |  |  | 2.0 |
| ENRD | equity: small | listed | 75 | failed |  |  |  |  | 3.0 |
| HNAMY | equity: small | listed | 0 | failed |  |  |  |  | 0.4 |
| FRPH | equity: small | listed | 10136 | analysis | similar |  | 0 | 3 | 33.7 |
| ATLQW | equity: small | listed | 1 | failed |  |  |  |  | 2.3 |
| CLBR-WT | equity: small | listed | 1 | failed |  |  |  |  | 2.4 |
| AELKY | equity: small | listed | 0 | failed |  |  |  |  | 0.5 |
| UUUFF | equity: small | listed | 2295 | analysis | similar |  | 0 | 1 | 9.6 |
| CGEM | equity: small | listed | 1435 | analysis | similar |  | 0 | 3 | 5.3 |
| PPLC | equity: small | listed | 149 | analysis | none |  | 0 | 3 | 2.8 |
| PADEF | equity: small | listed | 2116 | analysis | similar |  | 0 | 1 | 6.5 |
| TAWN | equity: small | listed | 26 | failed |  |  |  |  | 1.3 |
| GNTOF | equity: small | listed | 4751 | analysis | similar |  | 0 | 1 | 15.7 |
| MVCO | equity: small | listed | 7209 | analysis | similar |  | 0 | 3 | 23.6 |
| RLXXF | equity: small | listed | 2800 | analysis | similar |  | 0 | 1 | 9.0 |
| ASMLF | equity: small | listed | 3403 | analysis | similar |  | 0 | 1 | 10.7 |
| ARTC | equity: small | listed | 146 | failed |  |  |  |  | 2.3 |
| OOMA | equity: small | listed | 2814 | analysis | similar |  | 0 | 3 | 8.8 |
| PITAF | equity: small | listed | 1641 | analysis | similar |  | 0 | 1 | 5.9 |
| LFCR | equity: small | listed | 7702 | analysis | similar |  | 0 | 3 | 24.1 |
| PALL | etf | listed | 4204 | analysis | similar |  | 0 | 1 | 11.4 |
| TKNZ | etf | listed | 51 | failed |  |  |  |  | 2.5 |
| GXRP | etf | listed | 210 | failed |  |  |  |  | 1.9 |
| PPLT | etf | listed | 4204 | analysis | similar |  | 0 | 1 | 11.4 |
| VBNB | etf | listed | 83 | failed |  |  |  |  | 1.7 |
| TDOG | etf | listed | 171 | failed |  |  |  |  | 1.7 |
| BITW | etf | listed | 1454 | analysis | baseline |  | 0 | 1 | 4.3 |
| BTCO | etf | listed | 679 | analysis | baseline |  | 0 | 1 | 2.6 |
| ETHV | etf | listed | 547 | analysis | similar |  | 0 | 1 | 2.5 |
| GSUI | etf | listed | 157 | failed |  |  |  |  | 1.6 |
| BRRR | etf | listed | 679 | analysis | baseline |  | 0 | 1 | 2.7 |
| NVD | etf | available | 777 | analysis | baseline |  | 0 | 2 | 2.9 |
| ETHB | etf | listed | 137 | failed |  |  |  |  | 1.5 |
| XLE | etf | available | 6982 | analysis | similar |  | 2 | 2 | 23.3 |
| TSOL | etf | listed | 213 | failed |  |  |  |  | 3.1 |
| OKB | coin: top 100 | available | 2708 | analysis | similar |  | 0 | 2 | 22.0 |
| POL | coin: top 100 | available | 391 | analysis | baseline | unusual setup (1 matches) | 0 | 2 | 1.9 |
| USDGO | coin: top 100 | available | 207 | failed |  |  |  |  | 2.5 |
| ASTER | coin: top 100 | available | 373 | analysis | baseline | unusual setup (0 matches) | 0 | 2 | 1.5 |
| FIL | coin: top 100 | available | 3211 | analysis | similar |  | 1 | 2 | 12.7 |
| ENA | coin: top 100 | available | 909 | analysis | baseline | unusual setup (1 matches) | 3 | 2 | 4.6 |
| USDS | coin: top 100 | available | 409 | analysis | similar |  | 0 | 2 | 2.3 |
| SHIB | coin: top 100 | available | 2249 | analysis | baseline |  | 7 | 2 | 9.7 |
| HTX | coin: top 100 | available | 978 | analysis | baseline | unusual setup (0 matches) | 0 | 2 | 5.3 |
| DOT | coin: top 100 | available | 2230 | analysis | similar |  | 0 | 2 | 10.3 |
| USD1 | coin: top 100 | available | 410 | analysis | baseline | unusual setup (4 matches) | 2 | 2 | 1.4 |
| LIT | coin: top 100 | available | 271 | analysis | baseline | unusual setup (2 matches) | 2 | 2 | 1.6 |
| FIGR_HELOC | coin: top 100 | available | 360 | analysis | baseline | unusual setup (4 matches) | 0 | 2 | 1.6 |
| USDY | coin: top 100 | available | 391 | analysis | similar |  | 1 | 2 | 1.3 |
| BNB | coin: top 100 | available | 3245 | analysis | similar |  | 5 | 2 | 13.3 |
| MNT | coin: top 100 | available | 860 | analysis | similar |  | 0 | 2 | 3.3 |
| NEAR | coin: top 100 | available | 2175 | analysis | similar |  | 1 | 2 | 8.9 |
| PYTH | coin: top 100 | available | 1043 | analysis | baseline | unusual setup (0 matches) | 0 | 2 | 6.8 |
| APT | coin: top 100 | available | 369 | analysis | similar |  | 2 | 2 | 1.9 |
| STABLE | coin: top 100 | available | 281 | analysis | baseline | unusual setup (0 matches) | 0 | 2 | 1.4 |
| RHIMX | coin: long tail | listed | 0 | failed |  |  |  |  | 1.0 |
| MAG7XON | coin: long tail | listed | 5 | failed |  |  |  |  | 2.3 |
| GATSBY | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| ROIH | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| ARM-WETH-STETH | coin: long tail | listed | 0 | failed |  |  |  |  | 0.4 |
| USOON | coin: long tail | listed | 263 | analysis | similar |  | 0 | 2 | 5.3 |
| RWEC | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| RCFG | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| URA | coin: long tail | listed | 202 | failed |  |  |  |  | 2.3 |
| HMND | coin: long tail | listed | 1278 | analysis | baseline |  | 0 | 1 | 5.7 |
| IRENX | coin: long tail | listed | 67 | failed |  |  |  |  | 2.1 |
| PINGO | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| SIGNET | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| RMFC | coin: long tail | listed | 0 | failed |  |  |  |  | 0.7 |
| PATHUSD | coin: long tail | listed | 0 | failed |  |  |  |  | 0.4 |
| SAVIOUR | coin: long tail | listed | 0 | failed |  |  |  |  | 0.4 |
| WNUSDT0 | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
| BFX | coin: long tail | listed | 0 | failed |  |  |  |  | 0.6 |
| COMPANY | coin: long tail | listed | 0 | failed |  |  |  |  | 0.6 |
| AXLUSDT | coin: long tail | listed | 0 | failed |  |  |  |  | 0.5 |
