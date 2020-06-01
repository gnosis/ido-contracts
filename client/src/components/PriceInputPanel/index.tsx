import { Pair, Token } from "@uniswap/sdk";
import React, { useContext } from "react";
import styled, { ThemeContext } from "styled-components";
import { darken } from "polished";
import DoubleLogo from "../DoubleLogo";
import { RowBetween } from "../Row";
import { TYPE } from "../../theme";
import { Input as NumericalInput } from "../NumericalInput";

const InputRow = styled.div<{ selected: boolean }>`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  padding: ${({ selected }) =>
    selected ? "0.75rem 0.5rem 0.75rem 1rem" : "0.75rem 0.75rem 0.75rem 1rem"};
`;

const CurrencySelect = styled.button<{ selected: boolean }>`
  align-items: center;
  height: 2.2rem;
  font-size: 20px;
  font-weight: 500;
  background-color: ${({ selected, theme }) =>
    selected ? theme.bg1 : theme.primary1};
  color: ${({ selected, theme }) => (selected ? theme.text1 : theme.white)};
  border-radius: 12px;
  box-shadow: ${({ selected }) =>
    selected ? "none" : "0px 6px 10px rgba(0, 0, 0, 0.075)"};
  outline: none;
  cursor: pointer;
  user-select: none;
  border: none;
  padding: 0 0.5rem;

  :focus,
  :hover {
    background-color: ${({ selected, theme }) =>
      selected ? theme.bg2 : darken(0.05, theme.primary1)};
  }
`;

const LabelRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  color: ${({ theme }) => theme.text1};
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0.75rem 1rem 0 1rem;
  height: 20px;
  span:hover {
    cursor: pointer;
    color: ${({ theme }) => darken(0.2, theme.text2)};
  }
`;

const Aligner = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const InputPanel = styled.div<{ hideInput?: boolean }>`
  ${({ theme }) => theme.flexColumnNoWrap}
  position: relative;
  border-radius: ${({ hideInput }) => (hideInput ? "8px" : "20px")};
  background-color: ${({ theme }) => theme.bg2};
  z-index: 1;
`;

const Container = styled.div<{ hideInput: boolean }>`
  border-radius: ${({ hideInput }) => (hideInput ? "8px" : "20px")};
  border: 1px solid ${({ theme }) => theme.bg2};
  background-color: ${({ theme }) => theme.bg1};
`;

interface CurrencyInputPanelProps {
  value: string;
  field: string;
  onUserInput: (field: string, val: string) => void;
  onMax?: () => void;
  showMaxButton: boolean;
  label?: string;
  onTokenSelection?: (tokenAddress: string) => void;
  buyToken: Token | null;
  sellToken: Token | null;
  disableTokenSelect?: boolean;
  hideBalance?: boolean;
  isExchange?: boolean;
  pair?: Pair | null;
  hideInput?: boolean;
  showSendWithSwap?: boolean;
  otherSelectedTokenAddress?: string | null;
  id: string;
}

export default function PriceInputPanel({
  value,
  field,
  onUserInput,
  onMax,
  showMaxButton,
  label = "Input",
  buyToken = null,
  sellToken = null,
  disableTokenSelect = false,
  hideInput = false,
  id,
}: CurrencyInputPanelProps) {
  const theme = useContext(ThemeContext);

  return (
    <InputPanel id={id}>
      <Container hideInput={hideInput}>
        {!hideInput && (
          <LabelRow>
            <RowBetween>
              <TYPE.body color={theme.text2} fontWeight={500} fontSize={14}>
                {label}
              </TYPE.body>
            </RowBetween>
          </LabelRow>
        )}
        <InputRow
          style={hideInput ? { padding: "0", borderRadius: "8px" } : {}}
          selected={disableTokenSelect}
        >
          {!hideInput && (
            <>
              <NumericalInput
                className="price"
                value={value}
                onUserInput={(val) => {
                  onUserInput(field, val);
                }}
              />
            </>
          )}
          <CurrencySelect
            selected={!!sellToken}
            className="open-currency-select-button"
          >
            <Aligner>
              {
                <DoubleLogo
                  a0={buyToken?.address}
                  a1={sellToken?.address}
                  size={24}
                  margin={true}
                />
              }
              {!disableTokenSelect}
            </Aligner>
          </CurrencySelect>
        </InputRow>
      </Container>
    </InputPanel>
  );
}
