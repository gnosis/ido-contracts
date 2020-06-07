import { Percent, TokenAmount, Trade, TradeType } from "@uniswap/sdk";
import React, { useContext } from "react";
import { Repeat } from "react-feather";
import { Text } from "rebass";
import { ThemeContext } from "styled-components";
import { Field } from "../../state/swap/actions";
import { TYPE } from "../../theme";
import { formatExecutionPrice } from "../../utils/prices";
import { ButtonError } from "../Button";
import { AutoColumn } from "../Column";
import QuestionHelper from "../QuestionHelper";
import { AutoRow, RowBetween, RowFixed } from "../Row";
import FormattedPriceImpact from "./FormattedPriceImpact";
import { StyledBalanceMaxMini } from "./styleds";

export default function SwapModalFooter({
  trade,
  showInverted,
  setShowInverted,
  severity,
  onSwap,
  parsedAmounts,
  realizedLPFee,
  priceImpactWithoutFee,
  confirmText,
}: {
  trade?: Trade;
  showInverted: boolean;
  setShowInverted: (inverted: boolean) => void;
  severity: number;
  onSwap: () => any;
  parsedAmounts?: { [field in Field]?: TokenAmount };
  realizedLPFee?: TokenAmount;
  priceImpactWithoutFee?: Percent;
  confirmText: string;
}) {
  const theme = useContext(ThemeContext);
  return (
    <>
      <AutoRow>
        <ButtonError
          onClick={onSwap}
          error={severity > 2}
          style={{ margin: "10px 0 0 0" }}
          id="confirm-swap-or-send"
        >
          <Text fontSize={20} fontWeight={500}>
            {confirmText}
          </Text>
        </ButtonError>
      </AutoRow>
    </>
  );
}
