-- US fund tickers that a never-ingested coin row was holding.
--
-- scripts/seed-symbol-directory.mjs filled symbol_directory from SEC's
-- company_tickers.json and then CoinGecko's coin list, giving any ticker SEC
-- had not claimed to the first coin that used it. company_tickers.json lists
-- operating companies and a few trusts (SPY, GLD, DIA) but not funds, so ETF
-- tickers went to coins: QQQ became "Invesco QQQ - Robinhood Token", VOO a
-- Dinari tokenized copy, LQD the LiquidOps coin, VT "Vexor Terminal". Opening
-- /ticker/QQQ then tried only QQQ-USD (providerCandidates trusts a filed
-- asset_type), found nothing, and recorded the Nasdaq-100 ETF as unavailable.
--
-- This re-files 570 rows to etf. Each symbol here is:
--   - in SEC's company_tickers_mf.json (every registered fund share class),
--     fetched 2026-09-27;
--   - filed as crypto with status listed, i.e. never ingested (bars 0);
--   - not held, watchlisted, alerted, priced or analysed by anyone, and has
--     no crypto_metrics row (checked 2026-09-27; AIX was excluded for that);
--   - not in CoinGecko's top 500 by market cap (12 that are - FLOW, QTUM,
--     WEMIX, DEEP ... - stay coins).
-- The WHERE clause re-checks the first three at apply time, so a row that
-- changed since is left alone.
--
-- Names: a Dinari "(Tokenized ETF)" or "• Robinhood Token" copy trades under
-- the fund's own ticker, so it keeps the fund's name with the wrapper
-- stripped. Every other coin name is cleared, including xStock/aStock tokens,
-- whose tickers belong to a different fund (TSLAX is not Tesla). The provider
-- writes the real name on first ingest; search_symbols coalesces a null name.
--
-- Reversible: the previous rows are kept in symbol_directory_refile_0060.
-- To undo, run in one transaction:
--   select set_config('cairn.allow_asset_class_change', 'on', true);
--   update symbol_directory d set asset_type = b.asset_type, name = b.name, status = b.status, bars = b.bars
--     from symbol_directory_refile_0060 b where b.symbol = d.symbol;

create table if not exists public.symbol_directory_refile_0060 as
  select * from public.symbol_directory where false;
alter table public.symbol_directory_refile_0060 enable row level security;
revoke all on public.symbol_directory_refile_0060 from anon, authenticated;

create temporary table refile_0060 (symbol text primary key) on commit drop;
insert into refile_0060 (symbol) values
  ('AAA'), ('ABI'), ('ABOT'), ('ADIX'), ('ADS'), ('AETH'), ('AFK'), ('AFRAX'), ('AGG'), ('AGIX'), ('AIA'), ('AIPO'),
  ('AISM'), ('AKRE'), ('ALABX'), ('ALNYX'), ('ALPA'), ('ANGL'), ('AOK'), ('AOR'), ('APPX'), ('ARAB'), ('ARCX'), ('AREA'),
  ('ARESX'), ('ARIA'), ('ARKK'), ('ARKX'), ('ARKY'), ('ARMX'), ('ARMY'), ('ARTY'), ('ASD'), ('ASET'), ('ASIA'), ('ASLV'),
  ('ASMH'), ('ASP'), ('ASPCX'), ('ASTG'), ('ASTX'), ('AT'), ('AVL'), ('BAD'), ('BBB'), ('BBC'), ('BCI'), ('BCOR'),
  ('BES'), ('BETH'), ('BIB'), ('BILS'), ('BIS'), ('BITO'), ('BITX'), ('BITXX'), ('BLES'), ('BLOX'), ('BOND'), ('BOTZ'),
  ('BOXX'), ('BSCS'), ('BTCC'), ('BTCZ'), ('BTF'), ('BUCK'), ('BUG'), ('BUL'), ('BUZZ'), ('CA'), ('CAM'), ('CAPA'),
  ('CATF'), ('CATH'), ('CBOEX'), ('CDEX'), ('CDL'), ('CDX'), ('CEGX'), ('CGPT'), ('CHAT'), ('CHTRX'), ('CID'), ('CLIP'),
  ('CLUB'), ('COAL'), ('COLS'), ('COM'), ('CONX'), ('COOL'), ('COPX'), ('COPY'), ('CORP'), ('COSTX'), ('CPAI'), ('CPAYX'),
  ('CRED'), ('CRMX'), ('CROB'), ('CRPT'), ('CRUX'), ('CSPCX'), ('CTA'), ('CTASX'), ('CUT'), ('CWEB'), ('CWS'), ('DAPP'),
  ('DAT'), ('DDM'), ('DDX'), ('DECO'), ('DECT'), ('DESK'), ('DEUS'), ('DEW'), ('DHIX'), ('DIG'), ('DIME'), ('DIVI'),
  ('DIVO'), ('DLTRX'), ('DMX'), ('DON'), ('DRA'), ('DRGN'), ('DRIP'), ('DRN'), ('DSPY'), ('DTEC'), ('DUST'), ('DVY'),
  ('EDC'), ('EDEN'), ('EETH'), ('EGGS'), ('ELON'), ('EMC'), ('EPS'), ('EQTY'), ('ERY'), ('ESIM'), ('ETAN'), ('ETHIX'),
  ('ETHU'), ('EWT'), ('EWX'), ('EWY'), ('FAAAX'), ('FAB'), ('FAI'), ('FAIR'), ('FANX'), ('FB'), ('FBND'), ('FCTR'),
  ('FDM'), ('FEBU'), ('FELIX'), ('FERGX'), ('FEX'), ('FFRAX'), ('FGM'), ('FID'), ('FIDU'), ('FINA'), ('FISVX'), ('FIW'),
  ('FLAG'), ('FLKR'), ('FLNCX'), ('FM'), ('FNX'), ('FREL'), ('FSCC'), ('FSMLX'), ('FTRB'), ('FUSD'), ('FXD'), ('FXH'),
  ('FXI'), ('FXN'), ('FYC'), ('GARY'), ('GATE'), ('GCOW'), ('GDT'), ('GEEQ'), ('GEM'), ('GENZ'), ('GEVX'), ('GEX'),
  ('GFSX'), ('GIF'), ('GIGI'), ('GIGL'), ('GILDX'), ('GINUX'), ('GLDY'), ('GLPIX'), ('GOU'), ('GOVI'), ('GPT'), ('GRID'),
  ('GRIN'), ('GSATX'), ('GSC'), ('GTR'), ('GURU'), ('GXC'), ('HAPI'), ('HARD'), ('HAUS'), ('HBARX'), ('HBTC'), ('HEMI'),
  ('HERD'), ('HERO'), ('HF'), ('HIBS'), ('HIGH'), ('HLAL'), ('HOLD'), ('HSDTX'), ('HUBBX'), ('HUTX'), ('HYB'), ('HYMB'),
  ('IBMX'), ('IDNA'), ('IDX'), ('IEMGX'), ('IETH'), ('IGGY'), ('IMF'), ('INCO'), ('INDA'), ('INDEX'), ('INDIX'), ('INDY'),
  ('INFO'), ('INK'), ('INS'), ('ION'), ('IONX'), ('ITA'), ('ITAX'), ('JAAAX'), ('JADE'), ('JBBB'), ('JLTXX'), ('JOJO'),
  ('JRNY'), ('JUST'), ('KAT'), ('KDEF'), ('KEEF'), ('KLIP'), ('KNG'), ('KONG'), ('KORU'), ('KWEB'), ('KWIN'), ('LAMRX'),
  ('LCAP'), ('LCR'), ('LENS'), ('LHXX'), ('LLYX'), ('LMTS'), ('LNGX'), ('LQD'), ('LST'), ('MADE'), ('MAGA'), ('MAGS'),
  ('MARU'), ('MAXI'), ('MBOX'), ('MBS'), ('MCH'), ('MDBX'), ('MEDI'), ('MEM'), ('MEMEX'), ('MGC'), ('MILK'), ('MINT'),
  ('MLN'), ('MMIT'), ('MOO'), ('MOTO'), ('MPRO'), ('MRSHX'), ('MSCIX'), ('MSTRX'), ('MSTU'), ('MSTY'), ('MSTZ'), ('MUB'),
  ('MUST'), ('NATO'), ('NEBX'), ('NETX'), ('NICO'), ('NODE'), ('NUMI'), ('NUSA'), ('NVOX'), ('NWSAX'), ('NYM'), ('OCT'),
  ('ODDS'), ('OETH'), ('OHNO'), ('ONX'), ('OPAI'), ('ORO'), ('OVL'), ('OWLX'), ('PALLX'), ('PALU'), ('PARAX'), ('PCARX'),
  ('PCI'), ('PEZ'), ('PFGCX'), ('PGX'), ('PHO'), ('PICOX'), ('PID'), ('PIE'), ('PILL'), ('PINK'), ('PIT'), ('PORTX'),
  ('POW'), ('POWR'), ('PP'), ('PPI'), ('PQX'), ('PRAI'), ('PRIV'), ('PRN'), ('PRNT'), ('PRVT'), ('PSC'), ('PSI'),
  ('PSP'), ('PST'), ('PTF'), ('PTH'), ('PULS'), ('PUSH'), ('QAI'), ('QLC'), ('QQQ'), ('QQQB'), ('QUP'), ('QX'),
  ('RAA'), ('RB'), ('RBNTX'), ('RBRX'), ('RCATX'), ('RDDTX'), ('RDOG'), ('RDTE'), ('REFA'), ('REIX'), ('REKT'), ('REM'),
  ('REMX'), ('REVA'), ('REVS'), ('REW'), ('REZ'), ('RGLDX'), ('RI'), ('RING'), ('RISE'), ('RITA'), ('RIZE'), ('RLY'),
  ('RNEM'), ('RNRG'), ('ROAM'), ('ROBN'), ('ROBO'), ('RONB'), ('ROPE'), ('RPG'), ('RREMX'), ('RRXX'), ('RSMR'), ('RSPG'),
  ('RSSB'), ('RSX'), ('RW'), ('RWM'), ('RXD'), ('RYANX'), ('SATO'), ('SATOX'), ('SAVAX'), ('SBACX'), ('SDG'), ('SEA'),
  ('SECT'), ('SEMI'), ('SETH'), ('SFY'), ('SGOV'), ('SGOVX'), ('SH'), ('SHM'), ('SHOW'), ('SHY'), ('SINOX'), ('SIXP'),
  ('SIZE'), ('SKH'), ('SLVR'), ('SLVX'), ('SLX'), ('SMB'), ('SMCIX'), ('SMH'), ('SMHX'), ('SMI'), ('SMOG'), ('SMS'),
  ('SMTCX'), ('SNPSX'), ('SNXX'), ('SOLX'), ('SOXL'), ('SOXS'), ('SOXX'), ('SPCM'), ('SPDG'), ('SPGIX'), ('SPIN'), ('SPMO'),
  ('SPRE'), ('SPSK'), ('SPTE'), ('SPUS'), ('SPWO'), ('SPXU'), ('SPYX'), ('SQD'), ('SQQQ'), ('SRLN'), ('SSG'), ('SSS'),
  ('STAN'), ('STARX'), ('STBL'), ('STLDX'), ('STOX'), ('STRAX'), ('STRKX'), ('STRLX'), ('SUGR'), ('SURE'), ('SVOL'), ('TAIL'),
  ('TAXI'), ('TBLLX'), ('TBX'), ('TCAN'), ('TEMX'), ('TEST'), ('TFI'), ('THOR'), ('TIME'), ('TINY'), ('TMF'), ('TNA'),
  ('TOGA'), ('TOKE'), ('TOS'), ('TQQQ'), ('TRGPX'), ('TRIO'), ('TRND'), ('TRUF'), ('TRUU'), ('TSLAX'), ('TSLL'), ('TSLQ'),
  ('TSMX'), ('TTMIX'), ('TTT'), ('TUA'), ('UBT'), ('UFO'), ('ULTI'), ('ULTY'), ('UMI'), ('UMMA'), ('UNX'), ('UPSX'),
  ('URA'), ('USAI'), ('USD'), ('USDU'), ('USDX'), ('USFR'), ('USG'), ('USHY'), ('USOY'), ('UST'), ('UX'), ('UXRP'),
  ('VBCH'), ('VEGA'), ('VELL'), ('VGT'), ('VICE'), ('VICIX'), ('VIDAX'), ('VIG'), ('VIGI'), ('VLOX'), ('VOLT'), ('VOO'),
  ('VPLS'), ('VT'), ('VTC'), ('VTI'), ('VTRSX'), ('VWO'), ('VYM'), ('WAR'), ('WARP'), ('WDCX'), ('WEED'), ('WGMI'),
  ('WIBMX'), ('WILD'), ('WIP'), ('WISE'), ('WLDR'), ('WOOD'), ('WRLDX'), ('WTGXX'), ('XLG'), ('XLK'), ('XOMX'), ('XOP'),
  ('XPM'), ('XPP'), ('XRT'), ('XT'), ('XTN'), ('YANG'), ('YBTC'), ('YEAR'), ('YEET'), ('YETH'), ('YINN'), ('YLD'),
  ('YMAX'), ('YOLO'), ('ZAP'), ('ZSC'), ('ZSX'), ('ZZZ');

delete from refile_0060 r
 where not exists (
         select 1 from public.symbol_directory d
          where d.symbol = r.symbol and d.asset_type = 'crypto' and d.status = 'listed' and coalesce(d.bars, 0) = 0)
    or exists (select 1 from public.holdings h where h.symbol = r.symbol)
    or exists (select 1 from public.watchlist_items w where w.symbol = r.symbol)
    or exists (select 1 from public.alerts a where a.scope_value = r.symbol)
    or exists (select 1 from public.crypto_metrics c where c.symbol = r.symbol)
    or exists (select 1 from public.historical_prices p where p.symbol = r.symbol);

insert into public.symbol_directory_refile_0060
  select d.* from public.symbol_directory d join refile_0060 r using (symbol)
  on conflict do nothing;

-- The asset-class guard (0047) refuses crypto <-> non-crypto re-files unless
-- this is set for the transaction; this is the deliberate correction it asks for.
select set_config('cairn.allow_asset_class_change', 'on', true);

update public.symbol_directory d
   set asset_type = 'etf',
       name = case
                when d.name ~* '(\(Dinari Tokenized ETF\)|•\s*Robinhood Token)\s*$'
                  then nullif(btrim(regexp_replace(d.name, '\s*(\(Dinari Tokenized ETF\)|•\s*Robinhood Token)\s*$', '', 'i')), '')
                else null
              end,
       -- last_checked_at is left alone: ingest.ts isFresh() treats a recently
       -- checked 'listed' row as cooling down and would skip the first fetch.
       detail = null
  from refile_0060 r
 where r.symbol = d.symbol;

select set_config('cairn.allow_asset_class_change', '', true);
