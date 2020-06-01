import { parseUnits } from "@ethersproject/units";
import { Contract } from "@ethersproject/contracts";
import { ChainId } from "@uniswap/sdk";

import { JSBI, Token, TokenAmount, Trade } from "@uniswap/sdk";
import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { EASY_AUCTIONO_NETWORKS } from "../../constants/";
import { useContract } from "../../hooks/useContract";
import { useSingleCallResult } from "../../state/multicall/hooks";
import EasyAuctionTruffle from "../../contracts/EasyAuction.json";

import { useActiveWeb3React } from "../../hooks";
import { useTokenByAddressAndAutomaticallyAdd } from "../../hooks/Tokens";
import { useTradeExactIn, useTradeExactOut } from "../../hooks/Trades";
import { AppDispatch, AppState } from "../index";
import { useTokenBalancesTreatWETHAsETH } from "../wallet/hooks";
import { Field, setDefaultsFromURLSearch, typeInput } from "./actions";

export function useSwapState(): AppState["swap"] {
  return useSelector<AppState, AppState["swap"]>((state) => state.swap);
}

export function useSwapActionHandlers(): {
  onUserInput: (field: Field, typedValue: string) => void;
} {
  const dispatch = useDispatch<AppDispatch>();

  const onUserInput = useCallback(
    (field: Field, typedValue: string) => {
      dispatch(typeInput({ field, typedValue }));
    },
    [dispatch]
  );

  return {
    onUserInput,
  };
}

// try to parse a user entered amount for a given token
export function tryParseAmount(
  value?: string,
  token?: Token
): TokenAmount | undefined {
  if (!value || !token) {
    return;
  }
  try {
    const typedValueParsed = parseUnits(value, token.decimals).toString();
    if (typedValueParsed !== "0") {
      return new TokenAmount(token, JSBI.BigInt(typedValueParsed));
    }
  } catch (error) {
    // should fail if the user specifies too many decimal places of precision (or maybe exceed max uint?)
    console.debug(`Failed to parse input amount: "${value}"`, error);
  }
  // necessary for all paths to return a value
  return;
}

// from the current swap inputs, compute the best trade and return it.
export function useDerivedSwapInfo(): {
  auctionId: number;
  tokens: { [field in Field]?: Token };
  tokenBalances: { [field in Field]?: TokenAmount };
  parsedAmounts: { [field in Field]?: TokenAmount };
  bestTrade: Trade | null;
  error?: string;
  sellToken?: Token | null;
  buyToken?: Token | null;
} {
  const { chainId, account } = useActiveWeb3React();

  const easyAuctionInstance: Contract | null = useContract(
    EASY_AUCTIONO_NETWORKS[chainId as ChainId],
    EasyAuctionTruffle.abi
  );
  const auctionId = 1;

  const auctionInfo = useSingleCallResult(easyAuctionInstance, "auctionData", [
    auctionId,
  ]).result;
  const sellTokenAddress:
    | string
    | undefined = auctionInfo?.sellToken.toString();

  const buyTokenAddress: string | undefined = auctionInfo?.buyToken.toString();
  console.log("sellTokenAddress:", sellTokenAddress);

  let buyToken = useTokenByAddressAndAutomaticallyAdd(buyTokenAddress);

  let sellToken = useTokenByAddressAndAutomaticallyAdd(sellTokenAddress);

  const {
    independentField,
    typedValue,
    [Field.INPUT]: { address: tokenInAddress },
    [Field.OUTPUT]: { address: tokenOutAddress },
  } = useSwapState();

  const tokenIn = useTokenByAddressAndAutomaticallyAdd(tokenInAddress);
  const tokenOut = useTokenByAddressAndAutomaticallyAdd(tokenOutAddress);

  const relevantTokenBalances = useTokenBalancesTreatWETHAsETH(
    account ?? undefined,
    [tokenIn, tokenOut]
  );

  const isExactIn: boolean = independentField === Field.INPUT;
  const amount = tryParseAmount(typedValue, isExactIn ? tokenIn : tokenOut);

  const bestTradeExactIn = useTradeExactIn(
    isExactIn ? amount : undefined,
    tokenOut
  );
  const bestTradeExactOut = useTradeExactOut(
    tokenIn,
    !isExactIn ? amount : undefined
  );

  const bestTrade = isExactIn ? bestTradeExactIn : bestTradeExactOut;

  const parsedAmounts = {
    [Field.INPUT]: isExactIn ? amount : bestTrade?.inputAmount,
    [Field.OUTPUT]: isExactIn ? bestTrade?.outputAmount : amount,
  };

  const tokenBalances = {
    [Field.INPUT]: relevantTokenBalances?.[tokenIn?.address ?? ""],
    [Field.OUTPUT]: relevantTokenBalances?.[tokenOut?.address ?? ""],
  };

  const tokens: { [field in Field]?: Token } = {
    [Field.INPUT]: tokenIn,
    [Field.OUTPUT]: tokenOut,
  };

  let error: string | undefined;
  if (!account) {
    error = "Connect Wallet";
  }

  if (!parsedAmounts[Field.INPUT]) {
    error = error ?? "Enter an amount";
  }

  if (!parsedAmounts[Field.OUTPUT]) {
    error = error ?? "Enter an amount";
  }

  const [balanceIn, amountIn] = [
    tokenBalances[Field.INPUT],
    parsedAmounts[Field.INPUT],
  ];
  if (balanceIn && amountIn && balanceIn.lessThan(amountIn)) {
    error = "Insufficient " + amountIn.token.symbol + " balance";
  }

  return {
    auctionId,
    tokens,
    tokenBalances,
    parsedAmounts,
    bestTrade,
    error,
    sellToken,
    buyToken,
  };
}

// updates the swap state to use the defaults for a given network whenever the query
// string updates
export function useDefaultsFromURLSearch(search?: string) {
  const { chainId } = useActiveWeb3React();
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    if (!chainId) return;
    dispatch(setDefaultsFromURLSearch({ chainId, queryString: search }));
  }, [dispatch, search, chainId]);
}
