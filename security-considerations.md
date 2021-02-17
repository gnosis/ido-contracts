# Contract security considerations

## Price considerations

This section argues about some aspects of the security of the code, as for example rounding issues.
References in square brackets can be found in the code as comments of the form `\\[*]`.

### branch [14]

Claim: In the code, in branch [14], the clearing price p will be strictly between the
current iterOrder price and the previous iterOrder price.

First, we prove p < p(currentOrder) via contraction:
We assume: p >= p(currentOrder)
(In this proof all divisions are integer divisions)

```
p >= p(currentOrder)
fullAuctionAmount / prevBidSum >= buyAmountOfIter /sellAmountOfIter (as fractions)
<=> fullAuctionAmount * sellAmountOfIter >= prevBidSum * buyAmountOfIter
<=> fullAuctionAmount * sellAmountOfIter / buyAmountOfIter >= prevBidSum (as integer)
<=> 0 >= prevBidSum - fullAuctionAmount * sellAmountOfIter / buyAmountOfIter
<=> sellAmountOfIter >= prevBidSum + sellAmountOfIter - fullAuctionAmount * sellAmountOfIter / buyAmountOfIter
<=> sellAmountOfIter >= currentBidSum - fullAuctionAmount * sellAmountOfIter / buyAmountOfIter
<=> sellAmountOfIter >= uncoveredBids
```

Hence, we will not end up in the branch. Contradiction.

Next, we prove p > p(previousOrder):
From the while loop condition, we have:

```
prevBidSum * (buyAmountOfPrevIter) < fullAuctionedAmount * (sellAmountOfPrevIter)
<=> (buyAmountOfPrevIter) / (sellAmountOfPrevIter) < fullAuctionedAmount / prevBidSum (as Fractions)
<=> p(previousOrder) < p
```

### branch [15]

Claim: In the code, in branch [15], the clearing price p will be strictly between the
current iterOrder price and initial auction price.

First, we prove p > p(currentOrder):
Due to if condition, we have:

```
currentBidSum * buyAmountOfIter < fullAuctionedAmount * sellAmountOfIter
<=> buyAmountOfIter / sellAmountOfIter < fullAuctionedAmount / currentBidSum  (as fractions)
<=> p(currentOrder) < p
```

Next, we prove p < p(initialAuctionPrice).
Since,

```
currentBidSum > minAuctionedBuyAmount
<=> fullAuctionedAmount / currentBidSum < fullAuctionedAmount / minAuctionedBuyAmount
<=> p < p(initialAuctionPrice)
```

## Rounding considerations

(Based on the code at commit `33b35e7e294b57ef7fcdd27672ac99f672b99336`.)

Rounding issues may cause the contract to be frozen in case the total balance
that is withdrawn from the contract is larger than the amount deposited into
the contract. This issue would be particularly concerning in the case where one
of the tokens used (e.g., if the auction sells all and only existing token
units).

(References in square brackets can be found in the code as `\\[*]`. All
operations in this document are integer divisions rounding down to the smallest
integer. For example, `1/2 = 0` and `(-1)/2 = -1`. A recurring property is that
`a/c + b/c <= (a+b)/c`, where `c>0` and `a` and `b` are integers.)

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
  - fees to the dedicated address [5]✔, [7]

We will assume that cancelling an order is equivalent to not having created the
order in the first place. In terms of amounts, this is what happens with [1] and
[2]. At this point, we can consider just the case with no order cancelled.

### Rounding considerations: minFundingThresholdNotReached not met

If the flag `minFundingThresholdNotReached` is set and the condition is not met, the user will claim the amounts they deposited [10]. We argue that the
auctioneer receives back the full amount of auctioned tokens. This is done in
[4] for the auctioned funds and the fees: (the variables have been
renamed to make the naming consistent between the different functions, note
that these values are constant during the auction)

```
in = [0] = sellAmount * (FEE_DENOMINATOR + feeNumerator) / FEE_DENOMINATOR
[4] out = sellAmount + sellAmount * feeNumerator / FEE_DENOMINATOR
```

In and out amount are the same regardless of rounding.

We now assume that `minFundingThresholdNotReached` is unset. We consider
separately the amount of auction tokens and of bid tokens.

We argue that both bid tokens and auctioned tokens are not withdrawn beyond
reserves in this case.
Funds claiming by the auctioneer will be done via [11].
We will investigate the 4 different ways the price can be set in the `settleAuction` function separately ( The cases are given by the code branches [13], [14], [15] and [16])

### Rounding considerations: clearing price is determined by [16]

Assuming the initial auction price is used [11], then it means that the auction
has been settled at the price determined in case [16]. Then, the auctioneer
cannot withdraw more than `currentBidSum` bidding token:

```
[16]: volumeClearingPriceOrder = currentBidSum * fullAuctionedAmount / minAuctionedBuyAmount
[11]: auctioningTokenAmount = fullAuctionedAmount - volumeClearingPriceOrder
      biddingTokenAmount = volumeClearingPriceOrder * minAuctionedBuyAmount / fullAuctionedAmount
 =>   biddingTokenAmount <= currentBidSum
```

and `currentBidSum` is the sum of all orders. No user can withdraw bid tokens:
with the current restriction, case [17] of `claimFromParticipantOrder` is
always triggered. This means that no overflows happens for bid tokens.
Next, we consider auction tokens. Funds flow out when a user claims order funds
[17], the fees are paid out with `processFeesAndAuctioneerFunds` and the unsold auction tokens are sent back to the auctioneer ([11], discussed before).
Case [17] determines that the following amount
of auctioned tokens is withdrawn for each order by a user:

```
[17]: out_auction_token_per_order = sellAmount * priceNumerator / priceDenominator
```

We argue that `sum(out_per_order) <= currentBidSum * sellAmount / buyAmount`.
Since we assume to be in case [16], it must be that all orders
have been summed up [18] and `currentBidSum <= minAuctionedBuyAmount` [16].
Then:

```
 -    currentBidSum = sum(orderSellAmount) <= minAuctionedBuyAmount
 =>   sum(out_per_order) =  sum(orderSellAmount * sellAmount / buyAmount)
                         <= sum(orderSellAmount) * sellAmount / buyAmount =  currentBidSum * sellAmount / buyAmount
//[21]
```

Next, we analyze the amount transferred when paying out fees. The fee retrieval
triggers case [11], causing the following amount of tokens to be sent out:

```
[20]: feeAmount = sellAmount * feeNumerator / FEE_DENOMINATOR
[11]: auctioningTokenAmount = sellAmount - volumeClearingPriceOrder
      out_reimbursed_fees = feeAmount * auctioningTokenAmount / sellAmount
      out_paid_fees = feeAmount * (sellAmount - auctioningTokenAmount) / sellAmount
 =>   out = out_reimbursed_fees + out_paid_fees <= feeAmount * sellAmount / sellAmount <= feeAmount
```

We saw all ins/outs in case the auction settles with the initial
auction price. We can add up all transfers involving the auction token to see
that no more auction tokens as available are withdrawn at any point:

```
[0]:  in = sellAmount * (FEE_DENOMINATOR + feeNumerator) / FEE_DENOMINATOR
[11]: out_settle = sellAmount - currentBidSum * sellAmount / buyAmount
[11]: out_fees <= sellAmount * feeNumerator / FEE_DENOMINATOR
[21]: out_all_order <= sum(out_per_order) <= currentBidSum * sellAmount / buyAmount
 =>   out <= sellAmount + sellAmount * feeNumerator / FEE_DENOMINATOR
```

### Rounding considerations: clearing price is determined by [14], [15]

In case [14] and [15] the price is:

```
(priceNumerator, priceDenominator) = (fullAuctionedAmount, currentBidSum)
```

and `clearingOrder` is not an existing order (c.f. [Price considerations](##price-considerations)..

First, we argue that no more bid tokens are withdrawn than deposited. As before,
some bid tokens are deposited for every user order. They can be withdrawn in two
points: auctioneer claiming [11] and unmatched orders [23]. Note that no order
is partially matched since `clearingOrder` is not an existing order
(c.f. [Price considerations](##price-considerations).

```
[5]: out_settle = sellAmount * priceDenominator / priceNumerator
                 = fullAuctionedAmount * currentBidSum / fullAuctionedAmount
                 = currentBidSum
```

We assume that the `settleAuction` is built so that `currentBidSum` is
the sum of the bids of all orders smaller (as defined in the library
`IterableOrderedOrderSet`, meaning that the equality case is excluded) than
`clearingOrder`. This means in particular that the sum of orders matched in the
condition [23] is the total sum of all sold amounts in all orders minus
`currentBidSum`. The sum of withdrawn tokens (including those by [11]) must be
exactly the sum of all bid tokens sold by the users.

We show next that, again in cases [14] and [15], no more auction tokens are
withdrawn than deposited.
Auction tokens are withdrawn when claiming fees [7] and by the users in
`claimFromParticipantOrder` [17]:

```
[7]:  out_fees = sellAmount * feeNumerator / FEE_DENOMINATOR
[17]: out_per_order = orderSellAmount * priceNumerator / priceDenominator
                    = orderSellAmount * sellAmount / buyAmount

```

Note that `sum(orderSellAmount) = currentBidSum (= buyAmount)` over all orders
in branch [17]. This follows from the fact that all summed orders are smaller
than `clearingOrder`.
We use this to show that `sum(out_per_order) <= sellAmount`:

```
     sum(out_per_order) =  sum(orderSellAmount * sellAmount / buyAmount)
                        <= sum(orderSellAmount) * sellAmount / buyAmount = buyAmount * sellAmount / buyAmount = sellAmount
```

We have shown that in cases [14] and [15] no withdrawing issue are possible.

### Rounding considerations: clearing price is determined by [13]

It remains to consider case [13].
First, we argue that no more bid tokens are withdrawn than deposited. As before,
some bid tokens are deposited for every user order. They can be withdrawn in
three points: auctioneer claiming [11], partial order match claiming and
unmatched orders [23].
We start by considering the amount of bid tokens.
We use the same argument in the previous case to see that all orders larger than
`clearingPriceOrder` are settled leaving a total of `currentSumBid` still to
settle. As before, we assume that the function `settleAuction` is built so that
`currentBidSum` is the sum of the bids of all orders smaller than or equal to
the clearing price order.

Only auctioneer claiming [11] and clearing price order match [25] trigger a
transfer of bid token:

```
[5]: out_settle_auctioneer = sellAmount * priceDenominator / priceNumerator
                            = sellAmount * clearingPriceOrderSellAmount / clearingPriceOrderBuyAmount

[13]: volumeClearingPriceOrder = clearingPriceOrderSellAmount - (currentSumBid - sellAmount * clearingPriceOrderSellAmount / clearingPriceOrderBuyAmount)
                               = clearingPriceOrderSellAmount - currentSumBid + sellAmount * clearingPriceOrderSellAmount / clearingPriceOrderBuyAmount
[25]: out_settle_partial_order = clearingPriceOrderSellAmount - volumeClearingPriceOrder
                               = clearingPriceOrderSellAmount - (clearingPriceOrderSellAmount - currentSumBid + sellAmount * clearingPriceOrderSellAmount / clearingPriceOrderBuyAmount)
                               = currentSumBid - sellAmount * clearingPriceOrderSellAmount / clearingPriceOrderBuyAmount
      out = out_settle_auctioneer + out_settle_partial_order = currentSumBid
```

Finally, we show that in case [13] no more auction tokens are withdrawn than
deposited. Auction tokens are withdrawn when claiming fees [7] and by the users
in `claimFromParticipantOrder` [17]:

```
[7]:  out_fees = sellAmount * feeNumerator / FEE_DENOMINATOR
[17]: out_per_fully_matched_order = orderSellAmount * priceNumerator / priceDenominator
                                  = orderSellAmount * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount
[25]: out_clearing_price_order = volumeClearingPriceOrder * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount
                               =  (clearingPriceOrderSellAmount - currentSumBid) + sellAmount * clearingPriceOrderSellAmount / clearingPriceOrderBuyAmount) * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount
                               <= (clearingPriceOrderSellAmount - currentSumBid) * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount + sellAmount
```

Note that `currentBidSum` is the sum of all orders including the full clearing
price order:

```
currentBidSum = sum(orderSellAmount) + clearingPriceOrderSellAmount
```

where the sum is taken over all orders strictly smaller than the clearing price
order. We use this to compute the following sum:

```
[17]: sum(out_per_fully_matched_order) =  sum(orderSellAmount * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount)
                                       <= sum(orderSellAmount) * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount)
                                       =  (currentBidSum - clearingPriceOrderSellAmount) * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount)
```

Then the amount of auction token withdrawn is:

```
      out =  out_fees + out_clearing_price_order + sum(out_per_fully_matched_order)
          <= sellAmount * feeNumerator / FEE_DENOMINATOR
             + (clearingPriceOrderSellAmount - currentSumBid) * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount + sellAmount
             + (currentBidSum - clearingPriceOrderSellAmount) * clearingPriceOrderBuyAmount / clearingPriceOrderSellAmount)
          =  sellAmount * feeNumerator / FEE_DENOMINATOR + sellAmount
```

Which is smaller than the auction token input amount from [0].
