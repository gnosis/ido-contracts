import { parse } from "qs";
import { createReducer } from "@reduxjs/toolkit";
import {
  Field,
  selectToken,
  setDefaultsFromURLSearch,
  switchTokens,
  typeInput,
} from "./actions";

export interface SwapState {
  readonly independentField: Field;
  readonly typedValue: string;
  readonly auctionId: number;
  readonly [Field.INPUT]: {
    readonly address: string | undefined;
  };
  readonly [Field.OUTPUT]: {
    readonly address: string | undefined;
  };
}

const initialState: SwapState = {
  independentField: Field.INPUT,
  auctionId: 1,
  typedValue: "",
  [Field.INPUT]: {
    address: "",
  },
  [Field.OUTPUT]: {
    address: "",
  },
};

function parseAuctionIdParameter(urlParam: any): number {
  return typeof urlParam === "string" && !isNaN(parseInt(urlParam))
    ? parseInt(urlParam)
    : 1;
}

export default createReducer<SwapState>(initialState, (builder) =>
  builder
    .addCase(setDefaultsFromURLSearch, (_, { payload: { queryString } }) => {
      if (queryString && queryString.length > 1) {
        const parsedQs = parse(queryString, {
          parseArrays: false,
          ignoreQueryPrefix: true,
        });

        return {
          ...initialState,
          auctionId: parseAuctionIdParameter(parsedQs.auctionId),
        };
      }

      return {
        ...initialState,
        auctionId: 1,
      };
    })
    .addCase(selectToken, (state, { payload: { address, field } }) => {
      const otherField = field === Field.INPUT ? Field.OUTPUT : Field.INPUT;
      if (address === state[otherField].address) {
        // the case where we have to swap the order
        return {
          ...state,
          independentField:
            state.independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT,
          [field]: { address },
          [otherField]: { address: state[field].address },
        };
      } else {
        // the normal case
        return {
          ...state,
          [field]: { address },
        };
      }
    })
    .addCase(switchTokens, (state) => {
      return {
        ...state,
        independentField:
          state.independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT,
        [Field.INPUT]: { address: state[Field.OUTPUT].address },
        [Field.OUTPUT]: { address: state[Field.INPUT].address },
      };
    })
    .addCase(typeInput, (state, { payload: { field, typedValue } }) => {
      return {
        ...state,
        independentField: field,
        typedValue,
      };
    })
);
