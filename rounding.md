(Based on the code at commit `fad89a39eab3e61e35876f3673e796e1f8a92df4`.)

Rounding issues may cause the contract to be frozen in case the total balance
that is withdrawn from the contract is larger than the amount deposited into
the contract. This issue would be particularly concerning in the case where one
of the tokens used (e.g., if the auction sells all and only existing token
units).

(References in square brackets can be found in the code as `\\[*]`. All
operations in this document are integer divisions.)

We wish to argue that the amount transferred out is no larger than the amount
transferred in.
Transfers in occur on:
- auction initiation [0], for
```
     _auctionedSellAmount * (FEE_DENOMINATOR + feeNumerator) / FEE_DENOMINATOR
```
- order creation [1], for the full amount bid by the user.

Transfers out occur on:
- order cancellation [2]✔, giving back the amount bid by the user in an order.
- users claiming funds after the auction is concluded [3].
- auction closing and sending
  - funds to the auctioneer [4]✔, [5]
  - fees to the dedicated address [6]✔, [7], [8], [9]

We will assume that cancelling an order is equivalent to not having created the
order in the first place. In terms of amounts, this is what happens with [1] and
[2]. At this point, we can consider just the case with no order cancelled.

If the flag `minFundingThresholdNotReached` is set, the user claiming amounts
to withdrawing back the amount the user deposited [10]. We argue that the
auctioneer receives back the full amount of auctioned tokens. This is done in
[4] for the auctioned funds and in [6] for the fees: (the variables have been
renamed to make the naming consistent between the different functions, note
that these values are constant during the auction)
```
in = [0] = sellAmount * (FEE_DENOMINATOR + feeNumerator) / FEE_DENOMINATOR
out = [4] + [6]
[4] = sellAmount
[6] = sellAmount * feeNumerator / FEE_DENOMINATOR
```
In and out amount are the same regardless of rounding.

We now assume that `minFundingThresholdNotReached` is unset. We consider
separately the amount of auction tokens and of bid tokens.

We argue that both bid tokens and auctioned tokens are not withdrawn beyond
reserves in this case.
Funds claiming by the auctioneer can be either at the initial auction price [11]
or at a higher price [12].
Assuming the initial auction price is used [11], then it means that the auction
has been settled at the price determined in case [16] (out of the four possible
cases [13], [14], [15], [16] of `settleAuction`). Then:
```
[16]: volumeClearingPriceOrder = currentBidSum * fullAuctionedAmount / minAuctionedBuyAmount
[11]: auctioningTokenAmount = fullAuctionedAmount - volumeClearingPriceOrder
      biddingTokenAmount = volumeClearingPriceOrder * minAuctionedBuyAmount / fullAuctionedAmount
 =>   biddingTokenAmount <= currentBidSum
``` //[22]
and `currentBidSum` is the sum of all orders. No user can withdraw bid tokens:
with the current restriction, case [17] of `claimFromParticipantOrder` is
always triggered. This means that no overflows happens for bid tokens.
Next, we consider auction tokens. Funds flow out when a user claims order funds
[17], the fees are paid out with `claimFees` and the unsold auction tokens are
sent back to the auctioneer ([11], discussed before).
: case [17] determines that the following amount
of auctioned tokens is withdrawn for each order by a user:
```
[17]: out_auction_token_per_order = sellAmount * priceNumerator / priceDenominator
``` 
We argue that `sum(out_per_order) <= currentBidSum * sellAmount / buyAmount`.
Since we must be in case [16] as discussed before, it must be that all orders
have been summed up [18] and `currentBidSum <= minAuctionedBuyAmount` [16].
Then:
```
 -    currentBidSum = sum(orderSellAmount) <= minAuctionedBuyAmount
 =>   sum(out_per_order) =  sum(orderSellAmount * sellAmount / buyAmount)
                         <= sum(orderSellAmount) * sellAmount / buyAmount
                         =  currentBidSum * sellAmount / buyAmount
``` \\[21]
Next, we analyze the amount transferred when paying out fees. The fee retrieval
triggers case [19], causing the following amount of tokens to be sent out:
```
[20]: feeAmount = sellAmount * feeNumerator / FEE_DENOMINATOR
[19]: auctioningTokenAmount = sellAmount - volumeClearingPriceOrder
      out_reimbursed_fees = feeAmount * auctioningTokenAmount / sellAmount
      out_paid_fees = feeAmount * (sellAmount - auctioningTokenAmount) / sellAmount
 =>   out = out_reimbursed_fees + out_paid_fees <= feeAmount * sellAmount / sellAmount <= feeAmount
```
We saw all ins/outs un the case where the auction settles with the initial
auction price. We can add up all transfers involving the auction token to see
that no more auction tokens as available are withdrawn at any point:
```
[0]:  in = sellAmount * (FEE_DENOMINATOR + feeNumerator) / FEE_DENOMINATOR
[11]: out_settle = sellAmount - currentBidSum * sellAmount / buyAmount
[19]: out_fees <= sellAmount * feeNumerator / FEE_DENOMINATOR
[21]: out_all_order <= sum(out_per_order) <= currentBidSum * sellAmount / buyAmount
 =>   out <= sellAmount + sellAmount * feeNumerator / FEE_DENOMINATOR
```
The same argument as in [22] applies to see that not too much auction tokens are
withdrawn in this case.

The final case in the case where the final auction price is higher than the
initial auction price.
[unfinished...]
