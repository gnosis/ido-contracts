# EasyAuction

EasyAuction is a very simple Defi building lego brick to run auctions for liquidations, token buy back programs, and initial coin offerings(ICOs).
The EasyAuction platform is very simple and allows anyone to permissionlessly schedule an auction without any fees.
The underlying price finding mechanism for the auctions are the batch-auction mechanism.

## Background

This project is non-profit project. The author has not deployed the code to mainnet, but it was done by an unknown anonyms entity. The author does give any guarantees about the project.

## Use cases

### Liquidations

Many Defi platform have to liquiditate tokens in a trustless and decentralized manner.
The EasyAuction platform allows these platforms to schedule actions for selling their tokens with customized parameters, such as the time period of the auction.
The underlying mechanism of batch auctions will force market makers to compete with their bids on price (instead of gas) in the Ethereum mem-pool, which enforces a cheap and efficient mechanism to find a price for the to be liquiditated tokens.

### Token buy back programs

Many decentralized governance projects have to buy back their tokens or auctioning off their tokens.

### ICOs:

Initial token offering is the fair price-discovery. WIth this auction mechanism, they can find a fair price: All participants can bid and the best 5000 orders will be used to calculate the auction price in a fair, non-manipulative, decentralized way.
Using single batch auctions can be used to make an initial token-distribution to public investors, assuming the legal affairs are clarified beforehand.

## Protocol description

EasyAuction allows anyone to start a new auction of any ERC20 token(sellToken) against another ERC20 token (buyToken). The person initiaing the auction, the auctioneer, has to define the amount of token to be sold, the minimal price for the auction, and the end-time of the auction. Once the auctioneer initiates the auction with a ethereum transctioon the auction starts immediately and anyone can participate as a buyer. Each buyer places buy-orders with a specified limit price into the system. For shortlived auctions, different buyers will bid against other bidder in the mem-pool. Especially, once (EIP-1559)[https://eips.ethereum.org/EIPS/eip-1559] is implemented and the mining of a transaction is guaranteed for the next block, then bidders have to coompete on bidding limit-prices instead of the gas-prices to get included into the auction.
Anynoe can permissionly start a new batch auction
