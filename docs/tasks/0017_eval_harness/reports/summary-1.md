# Transcription and cleanup combinations

Generated 2026-10-23T22:30:26.835Z from the transcription results in `../results/transcription-1` and the cleanup results in `../results/cleanup-1`; prices and plans as checked on 2026-10-23.
Gates: both stages pass their hard gate and their relative gate against today's models (see each suite's report).
Latency is release to text inside us-east-1 for the provider calls only, in ms: the P50 / P95 of the sum over every pair of measured transcription and cleanup samples, so it assumes the two stages are independent and is never a sum of percentiles.
Cost per 15 s dictation at list price; a light month is 480 dictations (2 hours of audio), a heavy month 7200 (1 hour a day); "charged" counts only stages whose free allowance would not cover that volume.

## Dictation languages: one

| Transcriber | Cleanup | Gates | WER | Term errors | Meaning changes | Fresh P50 / P95 | Reused P50 / P95 | Per dictation | Light month list / charged | Heavy month list / charged |
|---|---|---|---|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | gpt-5.4-nano | fail (transcription, cleanup) | 3.6% | 10.1% | 2.0% | 1201 / 1821 | 1104 / 1577 | 0.0003 USD | 0.13 / 0.0000 USD | 2.00 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-5.4-nano@none | fail (transcription) | 3.6% | 10.1% | 0.0% | 1206 / 1768 | 1126 / 1539 | 0.0003 USD | 0.13 / 0.0000 USD | 1.99 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-5.6-luna | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 1809 / 3237 | 1682 / 2993 | 0.0003 USD | 0.16 / 0.0000 USD | 2.34 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-5.6-luna@none | fail (transcription) | 3.6% | 10.1% | 0.0% | 1430 / 1992 | 1341 / 2089 | 0.0003 USD | 0.13 / 0.0000 USD | 1.98 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-6-luna | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 2285 / 5569 | 2316 / 4267 | 0.0003 USD | 0.12 / 0.04 USD | 1.87 / 0.67 USD |
| whisper-large-v3-turbo | gpt-6-luna@none | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 1674 / 13262 | 1418 / 6917 | 0.0002 USD | 0.11 / 0.03 USD | 1.58 / 0.38 USD |
| whisper-large-v3-turbo | gpt-oss-120b | fail (transcription, cleanup) | 3.6% | 10.1% | 3.0% | 1118 / 2016 | 1078 / 1675 | 0.0004 USD | 0.17 / 0.0000 USD | 2.57 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-oss-120b@low | fail (transcription, cleanup) | 3.6% | 10.1% | 6.1% | 930 / 1480 | 816 / 1197 | 0.0003 USD | 0.14 / 0.0000 USD | 2.11 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-oss-20b | fail (transcription, cleanup) | 3.6% | 10.1% | 3.0% | 1108 / 1764 | 943 / 1560 | 0.0003 USD | 0.15 / 0.0000 USD | 2.20 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-oss-20b@low | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 766 / 1340 | 669 / 1061 | 0.0002 USD | 0.11 / 0.0000 USD | 1.62 / 0.0000 USD |
| whisper-large-v3 | gpt-5.4-nano | fail (transcription, cleanup) | 2.8% | 6.5% | 2.0% | 1225 / 1732 | 1138 / 1654 | 0.0006 USD | 0.28 / 0.0000 USD | 4.13 / 0.0000 USD |
| whisper-large-v3 | gpt-5.4-nano@none | fail (transcription) | 2.8% | 6.5% | 0.0% | 1231 / 1665 | 1156 / 1619 | 0.0006 USD | 0.27 / 0.0000 USD | 4.12 / 0.0000 USD |
| whisper-large-v3 | gpt-5.6-luna | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 1812 / 3235 | 1723 / 3046 | 0.0006 USD | 0.30 / 0.0000 USD | 4.47 / 0.0000 USD |
| whisper-large-v3 | gpt-5.6-luna@none | fail (transcription) | 2.8% | 6.5% | 0.0% | 1442 / 1878 | 1378 / 2119 | 0.0006 USD | 0.27 / 0.0000 USD | 4.11 / 0.0000 USD |
| whisper-large-v3 | gpt-6-luna | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 2263 / 5597 | 2356 / 4338 | 0.0006 USD | 0.27 / 0.04 USD | 4.00 / 0.67 USD |
| whisper-large-v3 | gpt-6-luna@none | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 1665 / 13290 | 1465 / 6967 | 0.0005 USD | 0.25 / 0.03 USD | 3.71 / 0.38 USD |
| whisper-large-v3 | gpt-oss-120b | fail (transcription, cleanup) | 2.8% | 6.5% | 3.0% | 1132 / 1804 | 1121 / 1730 | 0.0007 USD | 0.31 / 0.0000 USD | 4.70 / 0.0000 USD |
| whisper-large-v3 | gpt-oss-120b@low | fail (transcription, cleanup) | 2.8% | 6.5% | 6.1% | 950 / 1372 | 849 / 1291 | 0.0006 USD | 0.28 / 0.0000 USD | 4.24 / 0.0000 USD |
| whisper-large-v3 | gpt-oss-20b | fail (transcription, cleanup) | 2.8% | 6.5% | 3.0% | 1111 / 1647 | 981 / 1610 | 0.0006 USD | 0.29 / 0.0000 USD | 4.33 / 0.0000 USD |
| whisper-large-v3 | gpt-oss-20b@low | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 788 / 1243 | 704 / 1151 | 0.0005 USD | 0.25 / 0.0000 USD | 3.75 / 0.0000 USD |
| gpt-transcribe | gpt-5.4-nano | fail (cleanup) | 0.5% | 0.6% | 2.0% | 1418 / 1909 | 1313 / 1708 | 0.0012 USD | 0.59 / 0.54 USD | 8.90 / 8.10 USD |
| gpt-transcribe | gpt-5.4-nano@none | pass | 0.5% | 0.6% | 0.0% | 1415 / 1819 | 1335 / 1696 | 0.0012 USD | 0.59 / 0.54 USD | 8.89 / 8.10 USD |
| gpt-transcribe | gpt-5.6-luna | fail (cleanup) | 0.5% | 0.6% | 0.0% | 1995 / 3415 | 1884 / 3194 | 0.0013 USD | 0.62 / 0.54 USD | 9.24 / 8.10 USD |
| gpt-transcribe | gpt-5.6-luna@none | pass | 0.5% | 0.6% | 0.0% | 1636 / 2044 | 1544 / 2291 | 0.0012 USD | 0.59 / 0.54 USD | 8.88 / 8.10 USD |
| gpt-transcribe | gpt-6-luna | fail (cleanup) | 0.5% | 0.6% | 0.0% | 2445 / 5778 | 2514 / 4440 | 0.0012 USD | 0.58 / 0.58 USD | 8.77 / 8.77 USD |
| gpt-transcribe | gpt-6-luna@none | fail (cleanup) | 0.5% | 0.6% | 0.0% | 1852 / 13471 | 1619 / 7143 | 0.0012 USD | 0.57 / 0.57 USD | 8.48 / 8.48 USD |
| gpt-transcribe | gpt-oss-120b | fail (cleanup) | 0.5% | 0.6% | 3.0% | 1316 / 2052 | 1281 / 1856 | 0.0013 USD | 0.63 / 0.54 USD | 9.47 / 8.10 USD |
| gpt-transcribe | gpt-oss-120b@low | fail (cleanup) | 0.5% | 0.6% | 6.1% | 1142 / 1517 | 1023 / 1349 | 0.0013 USD | 0.60 / 0.54 USD | 9.01 / 8.10 USD |
| gpt-transcribe | gpt-oss-20b | fail (cleanup) | 0.5% | 0.6% | 3.0% | 1292 / 1846 | 1144 / 1762 | 0.0013 USD | 0.61 / 0.54 USD | 9.10 / 8.10 USD |
| gpt-transcribe | gpt-oss-20b@low | fail (cleanup) | 0.5% | 0.6% | 0.0% | 982 / 1403 | 880 / 1215 | 0.0012 USD | 0.57 / 0.54 USD | 8.52 / 8.10 USD |
| gpt-4o-mini-transcribe | gpt-5.4-nano | fail (transcription, cleanup) | 0.7% | 1.8% | 2.0% | 1553 / 3187 | 1382 / 2461 | 0.0009 USD | 0.44 / 0.38 USD | 6.54 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-5.4-nano@none | fail (transcription) | 0.7% | 1.8% | 0.0% | 1546 / 3052 | 1407 / 2407 | 0.0009 USD | 0.44 / 0.38 USD | 6.54 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-5.6-luna | fail (transcription, cleanup) | 0.7% | 1.8% | 0.0% | 2272 / 3955 | 2028 / 3651 | 0.0010 USD | 0.46 / 0.38 USD | 6.88 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-5.6-luna@none | fail (transcription) | 0.7% | 1.8% | 0.0% | 1777 / 3120 | 1639 / 2764 | 0.0009 USD | 0.44 / 0.38 USD | 6.53 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-6-luna | fail (transcription, cleanup) | 0.7% | 1.8% | 0.0% | 2734 / 6306 | 2676 / 5160 | 0.0009 USD | 0.43 / 0.43 USD | 6.42 / 6.42 USD |
| gpt-4o-mini-transcribe | gpt-6-luna@none | fail (transcription, cleanup) | 0.7% | 1.8% | 0.0% | 2116 / 13559 | 1772 / 7295 | 0.0009 USD | 0.41 / 0.41 USD | 6.12 / 6.12 USD |
| gpt-4o-mini-transcribe | gpt-oss-120b | fail (transcription, cleanup) | 0.7% | 1.8% | 3.0% | 1481 / 3107 | 1388 / 2514 | 0.0010 USD | 0.47 / 0.38 USD | 7.12 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-oss-120b@low | fail (transcription, cleanup) | 0.7% | 1.8% | 6.1% | 1272 / 2643 | 1095 / 2094 | 0.0009 USD | 0.44 / 0.38 USD | 6.66 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-oss-20b | fail (transcription, cleanup) | 0.7% | 1.8% | 3.0% | 1484 / 2934 | 1254 / 2304 | 0.0009 USD | 0.45 / 0.38 USD | 6.74 / 5.75 USD |
| gpt-4o-mini-transcribe | gpt-oss-20b@low | fail (transcription, cleanup) | 0.7% | 1.8% | 0.0% | 1115 / 2555 | 950 / 1948 | 0.0009 USD | 0.41 / 0.38 USD | 6.17 / 5.75 USD |
| gpt-4o-transcribe | gpt-5.4-nano | fail (transcription, cleanup) | 1.1% | 0.5% | 2.0% | 1531 / 2005 | 1453 / 1943 | 0.0017 USD | 0.81 / 0.76 USD | 12.17 / 11.37 USD |
| gpt-4o-transcribe | gpt-5.4-nano@none | fail (transcription) | 1.1% | 0.5% | 0.0% | 1532 / 1958 | 1475 / 1916 | 0.0017 USD | 0.81 / 0.76 USD | 12.16 / 11.37 USD |
| gpt-4o-transcribe | gpt-5.6-luna | fail (transcription, cleanup) | 1.1% | 0.5% | 0.0% | 2111 / 3512 | 2034 / 3392 | 0.0017 USD | 0.83 / 0.76 USD | 12.51 / 11.37 USD |
| gpt-4o-transcribe | gpt-5.6-luna@none | fail (transcription) | 1.1% | 0.5% | 0.0% | 1747 / 2150 | 1694 / 2454 | 0.0017 USD | 0.81 / 0.76 USD | 12.15 / 11.37 USD |
| gpt-4o-transcribe | gpt-6-luna | fail (transcription, cleanup) | 1.1% | 0.5% | 0.0% | 2553 / 5881 | 2671 / 4880 | 0.0017 USD | 0.80 / 0.80 USD | 12.04 / 12.04 USD |
| gpt-4o-transcribe | gpt-6-luna@none | fail (transcription, cleanup) | 1.1% | 0.5% | 0.0% | 1972 / 13574 | 1783 / 7324 | 0.0016 USD | 0.78 / 0.78 USD | 11.75 / 11.75 USD |
| gpt-4o-transcribe | gpt-oss-120b | fail (transcription, cleanup) | 1.1% | 0.5% | 3.0% | 1440 / 2102 | 1433 / 2051 | 0.0018 USD | 0.85 / 0.76 USD | 12.74 / 11.37 USD |
| gpt-4o-transcribe | gpt-oss-120b@low | fail (transcription, cleanup) | 1.1% | 0.5% | 6.1% | 1254 / 1667 | 1164 / 1582 | 0.0017 USD | 0.82 / 0.76 USD | 12.28 / 11.37 USD |
| gpt-4o-transcribe | gpt-oss-20b | fail (transcription, cleanup) | 1.1% | 0.5% | 3.0% | 1401 / 1956 | 1296 / 1929 | 0.0017 USD | 0.82 / 0.76 USD | 12.37 / 11.37 USD |
| gpt-4o-transcribe | gpt-oss-20b@low | fail (transcription, cleanup) | 1.1% | 0.5% | 0.0% | 1093 / 1535 | 1022 / 1444 | 0.0016 USD | 0.79 / 0.76 USD | 11.79 / 11.37 USD |

Free allowances at these volumes:

- gpt-4o-mini-transcribe, heavy month: no free allowance
- gpt-4o-mini-transcribe, light month: no free allowance
- gpt-4o-transcribe, heavy month: no free allowance
- gpt-4o-transcribe, light month: no free allowance
- gpt-5.4-nano, heavy month: complimentary tokens: 102480 of 2500000 per day
- gpt-5.4-nano, light month: complimentary tokens: 6832 of 2500000 per day
- gpt-5.4-nano@none, heavy month: complimentary tokens: 102480 of 2500000 per day
- gpt-5.4-nano@none, light month: complimentary tokens: 6832 of 2500000 per day
- gpt-5.6-luna, heavy month: complimentary tokens: 109680 of 2500000 per day
- gpt-5.6-luna, light month: complimentary tokens: 7312 of 2500000 per day
- gpt-5.6-luna@none, heavy month: complimentary tokens: 102240 of 2500000 per day
- gpt-5.6-luna@none, light month: complimentary tokens: 6816 of 2500000 per day
- gpt-6-luna, heavy month: no free allowance
- gpt-6-luna, light month: no free allowance
- gpt-6-luna@none, heavy month: no free allowance
- gpt-6-luna@none, light month: no free allowance
- gpt-oss-120b, heavy month: free plan: 240 of 1000 requests per day, 150960 of 200000 tokens per day
- gpt-oss-120b, light month: free plan: 16 of 1000 requests per day, 10064 of 200000 tokens per day
- gpt-oss-120b@low, heavy month: free plan: 240 of 1000 requests per day, 133440 of 200000 tokens per day
- gpt-oss-120b@low, light month: free plan: 16 of 1000 requests per day, 8896 of 200000 tokens per day
- gpt-oss-20b, heavy month: free plan: 240 of 1000 requests per day, 182880 of 200000 tokens per day
- gpt-oss-20b, light month: free plan: 16 of 1000 requests per day, 12192 of 200000 tokens per day
- gpt-oss-20b@low, heavy month: free plan: 240 of 1000 requests per day, 131520 of 200000 tokens per day
- gpt-oss-20b@low, light month: free plan: 16 of 1000 requests per day, 8768 of 200000 tokens per day
- gpt-transcribe, heavy month: no free allowance
- gpt-transcribe, light month: no free allowance
- whisper-large-v3-turbo, heavy month: free plan: 240 of 2000 requests per day, 3600 of 28800 audio seconds per day
- whisper-large-v3-turbo, light month: free plan: 16 of 2000 requests per day, 240 of 28800 audio seconds per day
- whisper-large-v3, heavy month: free plan: 240 of 2000 requests per day, 3600 of 28800 audio seconds per day
- whisper-large-v3, light month: free plan: 16 of 2000 requests per day, 240 of 28800 audio seconds per day

## Dictation languages: both (es, en)

| Transcriber | Cleanup | Gates | WER | Term errors | Meaning changes | Fresh P50 / P95 | Reused P50 / P95 | Per dictation | Light month list / charged | Heavy month list / charged |
|---|---|---|---|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | gpt-5.4-nano | fail (transcription, cleanup) | 3.6% | 10.1% | 2.0% | 1259 / 1828 | 1102 / 1642 | 0.0003 USD | 0.13 / 0.0000 USD | 2.00 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-5.4-nano@none | fail (transcription) | 3.6% | 10.1% | 0.0% | 1255 / 1784 | 1126 / 1595 | 0.0003 USD | 0.13 / 0.0000 USD | 1.99 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-5.6-luna | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 1885 / 3353 | 1693 / 3042 | 0.0003 USD | 0.16 / 0.0000 USD | 2.34 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-5.6-luna@none | fail (transcription) | 3.6% | 10.1% | 0.0% | 1475 / 2010 | 1341 / 2129 | 0.0003 USD | 0.13 / 0.0000 USD | 1.98 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-6-luna | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 2327 / 5931 | 2329 / 4422 | 0.0003 USD | 0.12 / 0.04 USD | 1.87 / 0.67 USD |
| whisper-large-v3-turbo | gpt-6-luna@none | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 1726 / 13313 | 1423 / 6900 | 0.0002 USD | 0.11 / 0.03 USD | 1.58 / 0.38 USD |
| whisper-large-v3-turbo | gpt-oss-120b | fail (transcription, cleanup) | 3.6% | 10.1% | 3.0% | 1173 / 2070 | 1084 / 1722 | 0.0004 USD | 0.17 / 0.0000 USD | 2.57 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-oss-120b@low | fail (transcription, cleanup) | 3.6% | 10.1% | 6.1% | 982 / 1499 | 815 / 1265 | 0.0003 USD | 0.14 / 0.0000 USD | 2.11 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-oss-20b | fail (transcription, cleanup) | 3.6% | 10.1% | 3.0% | 1157 / 1801 | 948 / 1595 | 0.0003 USD | 0.15 / 0.0000 USD | 2.20 / 0.0000 USD |
| whisper-large-v3-turbo | gpt-oss-20b@low | fail (transcription, cleanup) | 3.6% | 10.1% | 0.0% | 818 / 1374 | 667 / 1127 | 0.0002 USD | 0.11 / 0.0000 USD | 1.62 / 0.0000 USD |
| whisper-large-v3 | gpt-5.4-nano | fail (transcription, cleanup) | 2.8% | 6.5% | 2.0% | 1229 / 1701 | 1145 / 1846 | 0.0006 USD | 0.29 / 0.0000 USD | 4.28 / 0.0000 USD |
| whisper-large-v3 | gpt-5.4-nano@none | fail (transcription) | 2.8% | 6.5% | 0.0% | 1236 / 1637 | 1164 / 1736 | 0.0006 USD | 0.29 / 0.0000 USD | 4.28 / 0.0000 USD |
| whisper-large-v3 | gpt-5.6-luna | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 1806 / 3243 | 1735 / 3119 | 0.0006 USD | 0.31 / 0.0000 USD | 4.62 / 0.0000 USD |
| whisper-large-v3 | gpt-5.6-luna@none | fail (transcription) | 2.8% | 6.5% | 0.0% | 1448 / 1847 | 1385 / 2240 | 0.0006 USD | 0.28 / 0.0000 USD | 4.26 / 0.0000 USD |
| whisper-large-v3 | gpt-6-luna | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 2256 / 5611 | 2373 / 4551 | 0.0006 USD | 0.28 / 0.04 USD | 4.15 / 0.67 USD |
| whisper-large-v3 | gpt-6-luna@none | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 1664 / 13304 | 1473 / 6975 | 0.0005 USD | 0.26 / 0.03 USD | 3.86 / 0.38 USD |
| whisper-large-v3 | gpt-oss-120b | fail (transcription, cleanup) | 2.8% | 6.5% | 3.0% | 1131 / 1788 | 1126 / 1864 | 0.0007 USD | 0.32 / 0.0000 USD | 4.85 / 0.0000 USD |
| whisper-large-v3 | gpt-oss-120b@low | fail (transcription, cleanup) | 2.8% | 6.5% | 6.1% | 954 / 1339 | 856 / 1404 | 0.0006 USD | 0.29 / 0.0000 USD | 4.40 / 0.0000 USD |
| whisper-large-v3 | gpt-oss-20b | fail (transcription, cleanup) | 2.8% | 6.5% | 3.0% | 1111 / 1636 | 988 / 1697 | 0.0006 USD | 0.30 / 0.0000 USD | 4.48 / 0.0000 USD |
| whisper-large-v3 | gpt-oss-20b@low | fail (transcription, cleanup) | 2.8% | 6.5% | 0.0% | 790 / 1223 | 711 / 1270 | 0.0005 USD | 0.26 / 0.0000 USD | 3.90 / 0.0000 USD |
| gpt-transcribe | gpt-5.4-nano | fail (cleanup) | 0.8% | 1.1% | 2.0% | 1422 / 1840 | 1322 / 1809 | 0.0013 USD | 0.64 / 0.59 USD | 9.63 / 8.84 USD |
| gpt-transcribe | gpt-5.4-nano@none | pass | 0.8% | 1.1% | 0.0% | 1423 / 1793 | 1344 / 1736 | 0.0013 USD | 0.64 / 0.59 USD | 9.63 / 8.84 USD |
| gpt-transcribe | gpt-5.6-luna | fail (cleanup) | 0.8% | 1.1% | 0.0% | 1999 / 3417 | 1901 / 3207 | 0.0014 USD | 0.66 / 0.59 USD | 9.97 / 8.84 USD |
| gpt-transcribe | gpt-5.6-luna@none | pass | 0.8% | 1.1% | 0.0% | 1637 / 2016 | 1550 / 2317 | 0.0013 USD | 0.64 / 0.59 USD | 9.62 / 8.84 USD |
| gpt-transcribe | gpt-6-luna | fail (cleanup) | 0.8% | 1.1% | 0.0% | 2436 / 5786 | 2528 / 4448 | 0.0013 USD | 0.63 / 0.63 USD | 9.50 / 9.50 USD |
| gpt-transcribe | gpt-6-luna@none | fail (cleanup) | 0.8% | 1.1% | 0.0% | 1847 / 13479 | 1624 / 7132 | 0.0013 USD | 0.61 / 0.61 USD | 9.21 / 9.21 USD |
| gpt-transcribe | gpt-oss-120b | fail (cleanup) | 0.8% | 1.1% | 3.0% | 1324 / 1970 | 1286 / 1896 | 0.0014 USD | 0.68 / 0.59 USD | 10.21 / 8.84 USD |
| gpt-transcribe | gpt-oss-120b@low | fail (cleanup) | 0.8% | 1.1% | 6.1% | 1143 / 1504 | 1032 / 1383 | 0.0014 USD | 0.65 / 0.59 USD | 9.75 / 8.84 USD |
| gpt-transcribe | gpt-oss-20b | fail (cleanup) | 0.8% | 1.1% | 3.0% | 1300 / 1821 | 1152 / 1787 | 0.0014 USD | 0.66 / 0.59 USD | 9.83 / 8.84 USD |
| gpt-transcribe | gpt-oss-20b@low | fail (cleanup) | 0.8% | 1.1% | 0.0% | 979 / 1373 | 888 / 1252 | 0.0013 USD | 0.62 / 0.59 USD | 9.26 / 8.84 USD |
| gpt-4o-mini-transcribe | gpt-5.4-nano | fail (transcription, cleanup) | 0.8% | 1.9% | 2.0% | 2361 / 5330 | 2053 / 4032 | 0.0017 USD | 0.82 / 0.77 USD | 12.29 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-5.4-nano@none | fail (transcription) | 0.8% | 1.9% | 0.0% | 2348 / 5255 | 2075 / 4024 | 0.0017 USD | 0.82 / 0.77 USD | 12.29 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-5.6-luna | fail (transcription, cleanup) | 0.8% | 1.9% | 0.0% | 3078 / 5936 | 2797 / 4885 | 0.0018 USD | 0.84 / 0.77 USD | 12.63 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-5.6-luna@none | fail (transcription) | 0.8% | 1.9% | 0.0% | 2568 / 5324 | 2328 / 4291 | 0.0017 USD | 0.82 / 0.77 USD | 12.28 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-6-luna | fail (transcription, cleanup) | 0.8% | 1.9% | 0.0% | 3573 / 7362 | 3482 / 6395 | 0.0017 USD | 0.81 / 0.81 USD | 12.17 / 12.17 USD |
| gpt-4o-mini-transcribe | gpt-6-luna@none | fail (transcription, cleanup) | 0.8% | 1.9% | 0.0% | 2984 / 14333 | 2562 / 7969 | 0.0016 USD | 0.79 / 0.79 USD | 11.87 / 11.87 USD |
| gpt-4o-mini-transcribe | gpt-oss-120b | fail (transcription, cleanup) | 0.8% | 1.9% | 3.0% | 2298 / 5125 | 2069 / 3987 | 0.0018 USD | 0.86 / 0.77 USD | 12.87 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-oss-120b@low | fail (transcription, cleanup) | 0.8% | 1.9% | 6.1% | 2073 / 4846 | 1758 / 3715 | 0.0017 USD | 0.83 / 0.77 USD | 12.41 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-oss-20b | fail (transcription, cleanup) | 0.8% | 1.9% | 3.0% | 2277 / 5080 | 1950 / 3854 | 0.0017 USD | 0.83 / 0.77 USD | 12.49 / 11.50 USD |
| gpt-4o-mini-transcribe | gpt-oss-20b@low | fail (transcription, cleanup) | 0.8% | 1.9% | 0.0% | 1916 / 4758 | 1616 / 3584 | 0.0017 USD | 0.79 / 0.77 USD | 11.92 / 11.50 USD |
| gpt-4o-transcribe | gpt-5.4-nano | fail (transcription, cleanup) | 1.5% | 0.6% | 2.0% | 2269 / 2989 | 2181 / 2986 | 0.0033 USD | 1.57 / 1.52 USD | 23.54 / 22.74 USD |
| gpt-4o-transcribe | gpt-5.4-nano@none | fail (transcription) | 1.5% | 0.6% | 0.0% | 2267 / 2970 | 2203 / 2920 | 0.0033 USD | 1.57 / 1.52 USD | 23.53 / 22.74 USD |
| gpt-4o-transcribe | gpt-5.6-luna | fail (transcription, cleanup) | 1.5% | 0.6% | 0.0% | 2906 / 4306 | 2803 / 4208 | 0.0033 USD | 1.59 / 1.52 USD | 23.88 / 22.74 USD |
| gpt-4o-transcribe | gpt-5.6-luna@none | fail (transcription) | 1.5% | 0.6% | 0.0% | 2491 / 3197 | 2427 / 3325 | 0.0033 USD | 1.57 / 1.52 USD | 23.52 / 22.74 USD |
| gpt-4o-transcribe | gpt-6-luna | fail (transcription, cleanup) | 1.5% | 0.6% | 0.0% | 3361 / 6611 | 3433 / 5638 | 0.0033 USD | 1.56 / 1.56 USD | 23.41 / 23.41 USD |
| gpt-4o-transcribe | gpt-6-luna@none | fail (transcription, cleanup) | 1.5% | 0.6% | 0.0% | 2760 / 14296 | 2553 / 8086 | 0.0032 USD | 1.54 / 1.54 USD | 23.12 / 23.12 USD |
| gpt-4o-transcribe | gpt-oss-120b | fail (transcription, cleanup) | 1.5% | 0.6% | 3.0% | 2187 / 3217 | 2159 / 3023 | 0.0033 USD | 1.61 / 1.52 USD | 24.11 / 22.74 USD |
| gpt-4o-transcribe | gpt-oss-120b@low | fail (transcription, cleanup) | 1.5% | 0.6% | 6.1% | 1991 / 2690 | 1890 / 2603 | 0.0033 USD | 1.58 / 1.52 USD | 23.65 / 22.74 USD |
| gpt-4o-transcribe | gpt-oss-20b | fail (transcription, cleanup) | 1.5% | 0.6% | 3.0% | 2169 / 2974 | 2034 / 2842 | 0.0033 USD | 1.58 / 1.52 USD | 23.74 / 22.74 USD |
| gpt-4o-transcribe | gpt-oss-20b@low | fail (transcription, cleanup) | 1.5% | 0.6% | 0.0% | 1832 / 2536 | 1749 / 2460 | 0.0032 USD | 1.54 / 1.52 USD | 23.16 / 22.74 USD |

Free allowances at these volumes:

- gpt-4o-mini-transcribe, heavy month: no free allowance
- gpt-4o-mini-transcribe, light month: no free allowance
- gpt-4o-transcribe, heavy month: no free allowance
- gpt-4o-transcribe, light month: no free allowance
- gpt-5.4-nano, heavy month: complimentary tokens: 102480 of 2500000 per day
- gpt-5.4-nano, light month: complimentary tokens: 6832 of 2500000 per day
- gpt-5.4-nano@none, heavy month: complimentary tokens: 102480 of 2500000 per day
- gpt-5.4-nano@none, light month: complimentary tokens: 6832 of 2500000 per day
- gpt-5.6-luna, heavy month: complimentary tokens: 109680 of 2500000 per day
- gpt-5.6-luna, light month: complimentary tokens: 7312 of 2500000 per day
- gpt-5.6-luna@none, heavy month: complimentary tokens: 102240 of 2500000 per day
- gpt-5.6-luna@none, light month: complimentary tokens: 6816 of 2500000 per day
- gpt-6-luna, heavy month: no free allowance
- gpt-6-luna, light month: no free allowance
- gpt-6-luna@none, heavy month: no free allowance
- gpt-6-luna@none, light month: no free allowance
- gpt-oss-120b, heavy month: free plan: 240 of 1000 requests per day, 150960 of 200000 tokens per day
- gpt-oss-120b, light month: free plan: 16 of 1000 requests per day, 10064 of 200000 tokens per day
- gpt-oss-120b@low, heavy month: free plan: 240 of 1000 requests per day, 133440 of 200000 tokens per day
- gpt-oss-120b@low, light month: free plan: 16 of 1000 requests per day, 8896 of 200000 tokens per day
- gpt-oss-20b, heavy month: free plan: 240 of 1000 requests per day, 182880 of 200000 tokens per day
- gpt-oss-20b, light month: free plan: 16 of 1000 requests per day, 12192 of 200000 tokens per day
- gpt-oss-20b@low, heavy month: free plan: 240 of 1000 requests per day, 131520 of 200000 tokens per day
- gpt-oss-20b@low, light month: free plan: 16 of 1000 requests per day, 8768 of 200000 tokens per day
- gpt-transcribe, heavy month: no free allowance
- gpt-transcribe, light month: no free allowance
- whisper-large-v3-turbo, heavy month: free plan: 240 of 2000 requests per day, 3600 of 28800 audio seconds per day
- whisper-large-v3-turbo, light month: free plan: 16 of 2000 requests per day, 240 of 28800 audio seconds per day
- whisper-large-v3, heavy month: free plan: 251 of 2000 requests per day, 3764 of 28800 audio seconds per day
- whisper-large-v3, light month: free plan: 17 of 2000 requests per day, 251 of 28800 audio seconds per day

## Models

- `whisper-large-v3-turbo` (groq): price from https://console.groq.com/docs/models.
- `whisper-large-v3` (groq): price from https://console.groq.com/docs/models.
- `gpt-transcribe` (openai): price from https://developers.openai.com/api/docs/pricing.
- `gpt-4o-mini-transcribe` (openai): price from https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe; retires 2027-02-26 (https://developers.openai.com/api/docs/deprecations).
- `gpt-4o-transcribe` (openai): price from https://developers.openai.com/api/docs/models/gpt-4o-transcribe; retires 2027-02-26 (https://developers.openai.com/api/docs/deprecations).
- `gpt-5.4-nano` (openai): price from https://developers.openai.com/api/docs/pricing; retires 2027-04-01 (https://developers.openai.com/api/docs/deprecations).
- `gpt-5.6-luna` (openai): price from https://developers.openai.com/api/docs/pricing.
- `gpt-6-luna` (openai): price from https://developers.openai.com/api/docs/pricing.
- `openai/gpt-oss-120b` (groq): price from https://console.groq.com/docs/models.
- `openai/gpt-oss-20b` (groq): price from https://console.groq.com/docs/models.

