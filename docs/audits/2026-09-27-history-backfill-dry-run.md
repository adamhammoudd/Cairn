# History backfill dry run - 2026-09-27

Output of `npx tsx --conditions=react-server scripts/backfill-history.ts` (no writes) against production, 2026-09-27. Nothing has been written; `--apply` is Adam's call.


250 stored symbols; 228 candidates; 22 skipped (coins younger than 300 days, which already hold their full history).

| Symbol | Type | Stored bars | Stored from | Provider bars | Provider from | Rows to add | Result |
|---|---|---:|---|---:|---|---:|---|
| GOOGL | equity | 535 | 2024-08-08 | 5561 | 2004-08-19 | 5026 | would fetch |
| TSLA | equity | 535 | 2024-08-08 | 4086 | 2010-06-29 | 3551 | would fetch |
| AXON | equity | 527 | 2024-08-20 | 6355 | 2001-06-19 | 5828 | would fetch |
| CROX | equity | 527 | 2024-08-20 | 5190 | 2006-02-08 | 4663 | would fetch |
| CELH | equity | 527 | 2024-08-20 | 4952 | 2007-01-22 | 4425 | would fetch |
| SMCI | equity | 527 | 2024-08-20 | 4905 | 2007-03-29 | 4378 | would fetch |
| PLAB | equity | 527 | 2024-08-20 | 9963 | 1987-03-10 | 9436 | would fetch |
| KTOS | equity | 527 | 2024-08-20 | 6762 | 1999-11-05 | 6235 | would fetch |
| IONQ | equity | 527 | 2024-08-20 | 1439 | 2021-01-04 | 912 | would fetch |
| BROS | equity | 527 | 2024-08-20 | 1263 | 2021-09-15 | 736 | would fetch |
| PENN | equity | 527 | 2024-08-20 | 8138 | 1994-05-26 | 7611 | would fetch |
| ASML | equity | 527 | 2024-08-20 | 7936 | 1995-03-15 | 7409 | would fetch |
| BABA | equity | 527 | 2024-08-20 | 3022 | 2014-09-19 | 2495 | would fetch |
| SAP | equity | 527 | 2024-08-20 | 7807 | 1995-09-18 | 7280 | would fetch |
| SHOP | equity | 527 | 2024-08-20 | 2855 | 2015-05-20 | 2328 | would fetch |
| IWM | etf | 527 | 2024-08-20 | 6622 | 2000-05-26 | 6095 | would fetch |
| XLE | etf | 527 | 2024-08-20 | 6982 | 1998-12-22 | 6455 | would fetch |
| SCHD | etf | 527 | 2024-08-20 | 3754 | 2011-10-20 | 3227 | would fetch |
| EEM | etf | 527 | 2024-08-20 | 5901 | 2003-04-14 | 5374 | would fetch |
| TLT | etf | 527 | 2024-08-20 | 6079 | 2002-07-30 | 5552 | would fetch |
| GDX | etf | 527 | 2024-08-20 | 5119 | 2006-05-22 | 4592 | would fetch |
| ADA | crypto | 1827 | 2021-09-24 | 3245 | 2017-11-09 | 1418 | would fetch |
| ARKG | etf | 1256 | 2021-09-24 | 2992 | 2014-10-31 | 1736 | would fetch |
| RKLB | equity | 1256 | 2021-09-24 | 1465 | 2020-11-24 | 209 | would fetch |
| AAPL | equity | 1256 | 2021-09-24 | 11539 | 1980-12-12 | 10283 | would fetch |
| ISRG | equity | 1256 | 2021-09-24 | 6608 | 2000-06-16 | 5352 | would fetch |
| AMZN | equity | 1255 | 2021-09-27 | 7387 | 1997-05-15 | 6132 | would fetch |
| NVDA | equity | 1256 | 2021-09-24 | 6962 | 1999-01-22 | 5706 | would fetch |
| MSFT | equity | 1255 | 2021-09-27 | 10213 | 1986-03-13 | 8958 | would fetch |
| TSM | equity | 527 | 2024-08-20 | 7285 | 1997-10-09 | 6758 | would fetch |
| VNQ | etf | 527 | 2024-08-20 | 5533 | 2004-09-29 | 5006 | would fetch |
| JEPI | etf | 527 | 2024-08-20 | 1595 | 2020-05-21 | 1068 | would fetch |
| AVAX | crypto | 758 | 2024-08-29 | 2199 | 2020-07-13 | 1441 | would fetch |
| DOT | crypto | 758 | 2024-08-29 | 2230 | 2020-08-20 | 1472 | would fetch |
| ALGO | crypto | 758 | 2024-08-29 | 2656 | 2019-06-21 | 1898 | would fetch |
| FIL | crypto | 758 | 2024-08-29 | 3211 | 2017-12-13 | 2453 | would fetch |
| OP | crypto | 758 | 2024-08-29 | 1659 | 2022-03-14 | 901 | would fetch |
| INJ | crypto | 758 | 2024-08-29 | 2168 | 2020-10-21 | 1410 | would fetch |
| ARB | crypto | 369 | 2025-09-06 | 3227 | 2017-11-09 | 0 | REFUSED: provider prices don't match stored (22 shared dates, median ratio 0.0045) |
| ATOM | crypto | 369 | 2025-09-06 | 2755 | 2019-03-14 | 2386 | would fetch |
| M | crypto | 371 | 2025-08-31 | 1560 | 2022-06-21 | 0 | REFUSED: provider prices don't match stored (22 shared dates, median ratio 0.0002) |
| NEAR | crypto | 371 | 2025-08-31 | 2175 | 2020-10-14 | 1804 | would fetch |
| META | equity | 1255 | 2021-09-27 | 3609 | 2012-05-18 | 2354 | would fetch |
| AMD | equity | 1256 | 2021-09-24 | 11727 | 1980-03-17 | 10471 | would fetch |
| AP | equity | 1256 | 2021-09-24 | 13513 | 1973-02-21 | 12257 | would fetch |
| APP | equity | 1256 | 2021-09-24 | 1369 | 2021-04-15 | 113 | would fetch |
| COIN | equity | 1256 | 2021-09-24 | 1370 | 2021-04-14 | 114 | would fetch |
| NFLX | equity | 1256 | 2021-09-24 | 6125 | 2002-05-23 | 4869 | would fetch |
| NVD | etf | 777 | 2023-08-22 | 777 | 2023-08-22 | 0 | already complete |
| PLTR | equity | 1256 | 2021-09-24 | 1504 | 2020-09-30 | 248 | would fetch |
| SPCX | equity | 73 | 2026-06-12 | 73 | 2026-06-12 | 0 | already complete |
| UBER | equity | 1256 | 2021-09-24 | 1855 | 2019-05-10 | 599 | would fetch |
| APT | crypto | 369 | 2025-09-06 | - | - | 0 | unavailable: Provider has no data for this symbol |
| A7A5 | crypto | 380 | 2025-09-03 | 495 | 2025-05-21 | 115 | would fetch |
| BSV | crypto | 380 | 2025-09-04 | 2880 | 2018-11-09 | 2500 | would fetch |
| BTC | crypto | 1828 | 2021-09-26 | 4394 | 2014-09-17 | 2566 | would fetch |
| SPY | etf | 1256 | 2021-09-24 | 8472 | 1993-01-29 | 7216 | would fetch |
| UB | crypto | 372 | 2025-09-12 | - | - | 0 | unavailable: Provider has no data for this symbol |
| 1INCH | crypto | 380 | 2025-09-09 | 2102 | 2020-12-25 | 1722 | would fetch |
| 2Z | crypto | 356 | 2025-10-02 | 360 | 2025-10-02 | 4 | would fetch |
| AAVE | crypto | 391 | 2025-09-01 | 2187 | 2020-10-02 | 1796 | would fetch |
| AIOZ | crypto | 365 | 2025-09-22 | 2005 | 2021-04-02 | 1640 | would fetch |
| AKE | crypto | 378 | 2025-09-03 | 403 | 2025-08-21 | 25 | would fetch |
| AKT | crypto | 380 | 2025-09-07 | 2169 | 2020-10-20 | 1789 | would fetch |
| APE | crypto | 380 | 2025-09-08 | 2174 | 2020-10-01 | 1794 | would fetch |
| APEPE | crypto | 380 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| ASTER | crypto | 373 | 2025-09-19 | - | - | 0 | unavailable: Provider has no data for this symbol |
| ATH | crypto | 365 | 2025-09-24 | - | - | 0 | unavailable: Provider has no data for this symbol |
| AUSD | crypto | 381 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| AWE | crypto | 380 | 2025-09-10 | 500 | 2025-05-16 | 120 | would fetch |
| BAT | crypto | 380 | 2025-09-10 | 3245 | 2017-11-09 | 2865 | would fetch |
| BCAP | crypto | 374 | 2025-09-02 | - | - | 0 | unavailable: Provider has no data for this symbol |
| BCH | crypto | 409 | 2025-08-12 | 3245 | 2017-11-09 | 2836 | would fetch |
| BFUSD | crypto | 391 | 2025-09-01 | 406 | 2025-08-18 | 15 | would fetch |
| BNB | crypto | 411 | 2025-08-11 | 3245 | 2017-11-09 | 2834 | would fetch |
| BONK | crypto | 381 | 2025-09-04 | 1368 | 2022-12-30 | 987 | would fetch |
| BORG | crypto | 381 | 2025-09-07 | 1068 | 2023-10-26 | 687 | would fetch |
| BTSE | crypto | 380 | 2025-09-09 | 2184 | 2020-03-12 | 1804 | would fetch |
| BUIDL | crypto | 392 | 2025-08-31 | - | - | 0 | unavailable: Provider has no data for this symbol |
| CARDS | crypto | 380 | 2025-09-08 | - | - | 0 | unavailable: Provider has no data for this symbol |
| CC | crypto | 320 | 2025-11-10 | - | - | 0 | unavailable: Provider has no data for this symbol |
| CFX | crypto | 380 | 2025-09-05 | 2147 | 2020-11-11 | 1767 | would fetch |
| CHZ | crypto | 380 | 2025-09-08 | 2646 | 2019-07-01 | 2266 | would fetch |
| CRO | crypto | 391 | 2025-08-31 | 2845 | 2018-12-14 | 2454 | would fetch |
| OHM | crypto | 381 | 2025-09-04 | 2006 | 2021-04-01 | 1625 | would fetch |
| DRV | crypto | 380 | 2025-09-07 | - | - | 0 | unavailable: Provider has no data for this symbol |
| EGLD | crypto | 380 | 2025-09-09 | 2215 | 2020-09-04 | 1835 | would fetch |
| EIGEN | crypto | 380 | 2025-09-06 | 726 | 2024-10-01 | 346 | would fetch |
| ENA | crypto | 391 | 2025-09-01 | 909 | 2024-04-02 | 518 | would fetch |
| ETC | crypto | 390 | 2025-09-02 | 3245 | 2017-11-09 | 2855 | would fetch |
| ETH | crypto | 409 | 2025-08-11 | 3245 | 2017-11-09 | 2836 | would fetch |
| ETHFI | crypto | 378 | 2025-09-03 | 924 | 2024-03-18 | 546 | would fetch |
| EURC | crypto | 379 | 2025-09-03 | 1103 | 2023-09-21 | 724 | would fetch |
| EURCV | crypto | 381 | 2025-09-06 | 756 | 2024-09-02 | 375 | would fetch |
| EUTBL | crypto | 374 | 2025-09-02 | - | - | 0 | unavailable: Provider has no data for this symbol |
| FARTCOIN | crypto | 380 | 2025-09-07 | 705 | 2024-10-23 | 325 | would fetch |
| FDUSD | crypto | 380 | 2025-09-04 | 1157 | 2023-07-26 | 777 | would fetch |
| FIGR_HELOC | crypto | 360 | 2025-08-26 | - | - | 0 | unavailable: Provider has no data for this symbol |
| FLOKI | crypto | 380 | 2025-09-05 | 1904 | 2021-07-10 | 1524 | would fetch |
| FRAX | crypto | 381 | 2025-09-05 | 2101 | 2020-12-27 | 1720 | would fetch |
| GHO | crypto | 378 | 2025-09-02 | 1167 | 2023-07-16 | 789 | would fetch |
| GLM | crypto | 379 | 2025-09-14 | 3245 | 2017-11-09 | 2866 | would fetch |
| GNO | crypto | 380 | 2025-09-04 | 3245 | 2017-11-09 | 2865 | would fetch |
| GOMINING | crypto | 380 | 2025-09-08 | 883 | 2024-04-28 | 503 | would fetch |
| GRAM | crypto | 402 | 2025-08-18 | 894 | 2024-03-13 | 492 | would fetch |
| GRASS | crypto | 381 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| GRT | crypto | 380 | 2025-09-06 | - | - | 0 | unavailable: Provider has no data for this symbol |
| GUSD | crypto | 381 | 2025-09-08 | 2914 | 2018-10-06 | 2533 | would fetch |
| HASH | crypto | 380 | 2025-09-03 | - | - | 0 | unavailable: Provider has no data for this symbol |
| HBAR | crypto | 391 | 2025-08-31 | 2568 | 2019-09-17 | 2177 | would fetch |
| RDDT | equity | 631 | 2024-03-21 | 631 | 2024-03-21 | 0 | already complete |
| FUL | equity | 1255 | 2021-09-27 | 13513 | 1973-02-21 | 12258 | would fetch |
| DXYZ | equity | 628 | 2024-03-26 | 628 | 2024-03-26 | 0 | already complete |
| HTX | crypto | 391 | 2025-09-01 | 978 | 2024-01-24 | 0 | REFUSED: provider prices don't match stored (29 shared dates, median ratio 1.1867) |
| CRV | crypto | 379 | 2025-09-03 | 2236 | 2020-08-14 | 1857 | would fetch |
| CRVUSD | crypto | 381 | 2025-09-05 | 1185 | 2023-06-28 | 804 | would fetch |
| DAI | crypto | 410 | 2025-08-12 | 2502 | 2019-11-22 | 2092 | would fetch |
| DBR | crypto | 365 | 2025-09-24 | 1111 | 2022-12-18 | 0 | REFUSED: provider prices don't match stored (26 shared dates, median ratio 3.1343) |
| DCR | crypto | 380 | 2025-09-05 | 3245 | 2017-11-09 | 2865 | would fetch |
| DOGE | crypto | 409 | 2025-08-12 | 3245 | 2017-11-09 | 2836 | would fetch |
| HYPE | crypto | 409 | 2025-08-11 | - | - | 0 | unavailable: Provider has no data for this symbol |
| ICP | crypto | 391 | 2025-09-01 | 1967 | 2021-05-10 | 1576 | would fetch |
| IMX | crypto | 380 | 2025-09-10 | - | - | 0 | unavailable: Provider has no data for this symbol |
| IOTA | crypto | 380 | 2025-09-06 | 1094 | 2023-09-30 | 714 | would fetch |
| JAAA | crypto | 290 | 2025-11-13 | - | - | 0 | unavailable: Provider has no data for this symbol |
| JASMY | crypto | 381 | 2025-09-05 | 2055 | 2021-02-11 | 1674 | would fetch |
| JPYC | crypto | 326 | 2025-10-27 | 2007 | 2021-03-31 | 0 | REFUSED: provider prices don't match stored (20 shared dates, median ratio 1.5033) |
| JST | crypto | 378 | 2025-09-02 | 2335 | 2020-05-07 | 1957 | would fetch |
| JTO | crypto | 380 | 2025-09-06 | 1026 | 2023-12-07 | 646 | would fetch |
| JTRSY | crypto | 290 | 2025-11-13 | - | - | 0 | unavailable: Provider has no data for this symbol |
| JUP | crypto | 378 | 2025-09-02 | 3181 | 2017-11-09 | 0 | REFUSED: provider prices don't match stored (17 shared dates, median ratio 0.0014) |
| KAG | crypto | 380 | 2025-09-05 | 1259 | 2023-04-18 | 0 | REFUSED: provider prices don't match stored (22 shared dates, median ratio 0.6747) |
| KAIA | crypto | 381 | 2025-09-06 | 699 | 2024-10-29 | 318 | would fetch |
| KAS | crypto | 391 | 2025-09-02 | 1580 | 2022-06-01 | 1189 | would fetch |
| KAU | crypto | 379 | 2025-09-03 | - | - | 0 | unavailable: Provider has no data for this symbol |
| KCS | crypto | 378 | 2025-09-02 | 3245 | 2017-11-09 | 2867 | would fetch |
| KITE | crypto | 320 | 2025-11-03 | 329 | 2025-11-03 | 9 | would fetch |
| KMNO | crypto | 380 | 2025-09-09 | 881 | 2024-04-30 | 501 | would fetch |
| KOGE | crypto | 381 | 2025-09-05 | 1329 | 2023-02-07 | 948 | would fetch |
| LDO | crypto | 380 | 2025-09-04 | 2092 | 2021-01-05 | 1712 | would fetch |
| LEO | crypto | 409 | 2025-08-12 | 2687 | 2019-05-21 | 2278 | would fetch |
| LINK | crypto | 409 | 2025-08-12 | 3245 | 2017-11-09 | 2836 | would fetch |
| LTC | crypto | 398 | 2025-08-22 | 4394 | 2014-09-17 | 3996 | would fetch |
| LUNC | crypto | 381 | 2025-09-04 | 2620 | 2019-07-27 | 2239 | would fetch |
| MINA | crypto | 380 | 2025-09-10 | 1945 | 2021-06-01 | 1565 | would fetch |
| MNT | crypto | 391 | 2025-09-01 | 579 | 2022-09-29 | 0 | REFUSED: provider prices don't match stored (29 shared dates, median ratio 0.0003) |
| MON | crypto | 300 | 2025-11-24 | 1560 | 2021-10-15 | 1260 | would fetch |
| MORPHO | crypto | 391 | 2025-09-01 | - | - | 0 | unavailable: Provider has no data for this symbol |
| NEXO | crypto | 378 | 2025-09-02 | 3071 | 2018-05-01 | 2693 | would fetch |
| NFT | crypto | 381 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| NPC | crypto | 380 | 2025-09-07 | - | - | 0 | unavailable: Provider has no data for this symbol |
| OKB | crypto | 392 | 2025-08-31 | 2708 | 2019-04-30 | 2316 | would fetch |
| ONDO | crypto | 391 | 2025-09-01 | 984 | 2024-01-18 | 593 | would fetch |
| OUSG | crypto | 381 | 2025-09-03 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PAXG | crypto | 391 | 2025-09-01 | 2559 | 2019-09-26 | 2168 | would fetch |
| PC0000031 | crypto | 380 | 2025-09-06 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PC0000033 | crypto | 380 | 2025-09-08 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PC0000097 | crypto | 380 | 2025-09-09 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PENDLE | crypto | 380 | 2025-09-04 | 1978 | 2021-04-29 | 1598 | would fetch |
| PENGU | crypto | 380 | 2025-09-03 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PEPE | crypto | 391 | 2025-09-01 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PIEVERSE | crypto | 309 | 2025-11-14 | 318 | 2025-11-14 | 9 | would fetch |
| POL | crypto | 391 | 2025-09-02 | - | - | 0 | unavailable: Provider has no data for this symbol |
| PYTH | crypto | 380 | 2025-09-03 | 1043 | 2023-11-20 | 663 | would fetch |
| PYUSD | crypto | 392 | 2025-08-31 | 1132 | 2023-08-20 | 740 | would fetch |
| RAIN | crypto | 379 | 2025-09-11 | - | - | 0 | unavailable: Provider has no data for this symbol |
| RAY | crypto | 380 | 2025-09-05 | 2045 | 2021-02-21 | 1665 | would fetch |
| RENDER | crypto | 378 | 2025-09-02 | 2299 | 2020-06-11 | 1921 | would fetch |
| REUSD | crypto | 380 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| RLUSD | crypto | 392 | 2025-08-31 | 642 | 2024-12-25 | 250 | would fetch |
| RUNE | crypto | 380 | 2025-09-08 | 2624 | 2019-07-23 | 2244 | would fetch |
| SAND | crypto | 380 | 2025-09-10 | 2236 | 2020-08-14 | 1856 | would fetch |
| SFP | crypto | 380 | 2025-09-09 | 2058 | 2021-02-08 | 1678 | would fetch |
| SHFL | crypto | 380 | 2025-09-08 | 923 | 2024-03-19 | 543 | would fetch |
| SHIB | crypto | 391 | 2025-08-31 | 2249 | 2020-08-01 | 1858 | would fetch |
| SN51 | crypto | 380 | 2025-09-11 | 465 | 2025-06-20 | 85 | would fetch |
| SN64 | crypto | 365 | 2025-09-22 | 465 | 2025-06-20 | 100 | would fetch |
| SOL | crypto | 411 | 2025-08-11 | 2362 | 2020-04-10 | 1951 | would fetch |
| SUPER | crypto | 365 | 2025-09-27 | - | - | 0 | unavailable: Provider has no data for this symbol |
| SYRUP | crypto | 380 | 2025-09-05 | 684 | 2024-11-13 | 304 | would fetch |
| TAO | crypto | 390 | 2025-09-01 | - | - | 0 | unavailable: Provider has no data for this symbol |
| THETA | crypto | 380 | 2025-09-07 | 3176 | 2018-01-17 | 2796 | would fetch |
| TIA | crypto | 380 | 2025-09-03 | 1673 | 2022-02-28 | 1293 | would fetch |
| TIBBIR | crypto | 381 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| TRAC | crypto | 380 | 2025-09-08 | 3168 | 2018-01-25 | 2788 | would fetch |
| TRUMP | crypto | 379 | 2025-09-02 | - | - | 0 | unavailable: Provider has no data for this symbol |
| TRX | crypto | 411 | 2025-08-11 | 3245 | 2017-11-09 | 2834 | would fetch |
| TUSD | crypto | 379 | 2025-09-03 | 3128 | 2018-03-06 | 2749 | would fetch |
| TWT | crypto | 381 | 2025-09-05 | 2251 | 2020-07-30 | 1870 | would fetch |
| ULTIMA | crypto | 381 | 2025-09-07 | 1068 | 2023-10-26 | 687 | would fetch |
| UNI | crypto | 391 | 2025-08-31 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USD0 | crypto | 378 | 2025-09-03 | 788 | 2024-08-01 | 410 | would fetch |
| USD1 | crypto | 410 | 2025-08-12 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USDAI | crypto | 380 | 2025-09-04 | 360 | 2025-10-03 | 0 | already complete |
| USDC | crypto | 411 | 2025-08-11 | 2912 | 2018-10-08 | 2501 | would fetch |
| USDD | crypto | 391 | 2025-09-01 | 1610 | 2022-05-02 | 1219 | would fetch |
| USDE | crypto | 409 | 2025-08-13 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USDF | crypto | 391 | 2025-09-01 | 2218 | 2020-09-01 | 0 | REFUSED: provider prices don't match stored (29 shared dates, median ratio 2.1504) |
| USDG | crypto | 391 | 2025-08-31 | 690 | 2024-11-06 | 0 | REFUSED: provider prices don't match stored (28 shared dates, median ratio 5.4493) |
| USDS | crypto | 409 | 2025-08-12 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USDT | crypto | 411 | 2025-08-11 | 3245 | 2017-11-09 | 2834 | would fetch |
| USDTB | crypto | 379 | 2025-09-03 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USDY | crypto | 391 | 2025-09-01 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USELESS | crypto | 380 | 2025-09-05 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USTB | crypto | 378 | 2025-09-02 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USTBL | crypto | 381 | 2025-09-07 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USX | crypto | 359 | 2025-09-27 | - | - | 0 | unavailable: Provider has no data for this symbol |
| USYC | crypto | 209 | 2025-09-01 | - | - | 0 | unavailable: Provider has no data for this symbol |
| VIRTUAL | crypto | 380 | 2025-09-03 | 956 | 2024-02-15 | 576 | would fetch |
| VSN | crypto | 380 | 2025-09-08 | - | - | 0 | unavailable: Provider has no data for this symbol |
| WBT | crypto | 409 | 2025-08-12 | 1494 | 2022-08-26 | 1085 | would fetch |
| WIF | crypto | 380 | 2025-09-06 | 1014 | 2023-12-19 | 634 | would fetch |
| WLD | crypto | 391 | 2025-09-01 | 1656 | 2022-03-03 | 1265 | would fetch |
| WLFI | crypto | 391 | 2025-09-01 | 743 | 2024-09-15 | 0 | REFUSED: provider prices don't match stored (0 shared dates, median ratio n/a) |
| XAUT | crypto | 391 | 2025-08-31 | 2425 | 2020-02-07 | 2034 | would fetch |
| XCN | crypto | 380 | 2025-09-08 | 3244 | 2017-11-09 | 0 | REFUSED: provider prices don't match stored (26 shared dates, median ratio 0.2589) |
| XDC | crypto | 378 | 2025-09-03 | 3090 | 2018-04-13 | 2712 | would fetch |
| XEC | crypto | 380 | 2025-09-08 | 1908 | 2021-07-08 | 1528 | would fetch |
| XLM | crypto | 409 | 2025-08-12 | 3245 | 2017-11-09 | 2836 | would fetch |
| XMR | crypto | 409 | 2025-08-12 | 3245 | 2017-11-09 | 2836 | would fetch |
| XRP | crypto | 411 | 2025-08-11 | 3245 | 2017-11-09 | 2834 | would fetch |
| XTZ | crypto | 380 | 2025-09-05 | 3245 | 2017-11-09 | 2865 | would fetch |
| YLDS | crypto | 264 | 2025-11-14 | 123 | 2026-05-28 | 0 | already complete |
| ZBCN | crypto | 381 | 2025-09-06 | 904 | 2024-04-06 | 523 | would fetch |
| ZEC | crypto | 409 | 2025-08-12 | 3245 | 2017-11-09 | 2836 | would fetch |
| ZEN | crypto | 380 | 2025-09-09 | 3245 | 2017-11-09 | 2865 | would fetch |
| ZK | crypto | 365 | 2025-09-21 | - | - | 0 | unavailable: Provider has no data for this symbol |
| ZRO | crypto | 380 | 2025-09-03 | - | - | 0 | unavailable: Provider has no data for this symbol |

**Would add ~394,699 rows (~113 MB at 301 bytes/row incl. indexes). 6 already complete, 12 refused by the identity check, 51 failed.**
