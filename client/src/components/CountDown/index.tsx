import styled from "styled-components";
import React, { useEffect, useState } from "react";

const CountDownStyled = styled.div`
  display: flex;
  order: 2;
  font-family: var(--font-mono);
  text-align: center;
  font-size: 0.6rem;
  color: var(--color-text-primary);
  width: 16rem;
  letter-spacing: 0;
  > strong {
    color: var(--color-text-active);
  }
`;

export function formatSeconds(seconds: number): string {
  const days = Math.floor(seconds / 24 / 60 / 60 / 1000) % 360;
  const hours = Math.floor(seconds / 60 / 60 / 1000) % 24;
  const minutes = Math.floor(seconds / 60 / 1000) % 60;
  const remainderSeconds = Math.floor((seconds / 1000) % 60);
  let s = "";

  if (days > 0) {
    s += `${days}d `;
  }
  if (hours > 0) {
    s += `${hours}h `;
  }
  if (minutes > 0) {
    s += `${minutes}m `;
  }
  if (remainderSeconds > 0 && hours !== 0) {
    s += `${remainderSeconds}s`;
  }
  if (minutes === 0 && remainderSeconds === 0) {
    s = "0s";
  }

  return s;
}

const calculateTimeLeft = (auctionEndDate) => {
  const diff = auctionEndDate - +new Date();
  if (diff < 0) return 0;
  return diff;
};

export default function CountdownTimer({
  auctionEndDate,
}: {
  auctionEndDate: number;
}) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(auctionEndDate));

  useEffect(() => {
    setTimeout(() => {
      setTimeLeft(calculateTimeLeft(auctionEndDate));
    }, 1000);
  });

  return (
    <CountDownStyled>
      Auction ends: <strong>{formatSeconds(timeLeft)}</strong>
    </CountDownStyled>
  );
}
