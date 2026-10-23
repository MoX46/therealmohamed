---
title: "Understanding greatness"
date: 2026-10-20
description: "What the chess rating system can tell us about how much better the best really are."
draft: true
---

This isn’t an article about chess, but we must start our journey on the 64 squares of a chess board. I, like many, got obsessed with chess after [*The Queen’s Gambit*](https://en.wikipedia.org/wiki/The_Queen%27s_Gambit_(miniseries)) was released on Netflix and the world was forced to stay at home during the COVID lockdowns. I had never actually played chess before, but at 30 I tried my hand at it for the first time. Unsurprisingly I wasn’t very good. But I watched a few tutorial videos and started slowly learning the game. I spent a LOT of time playing - much more than I’m willing to admit - but with practice my rating started improving.

Chess uses an Elo rating system, which measures the relative skill level of players. I started at an Elo rating of about 500 and I’m at about 1400. But what does this exactly mean? How much better did I get if I gained 900 points? And what can this tell us about greatness?

The Elo rating system is based on statistics, and the basic concept is simple. Imagine you have a group of players and you give everyone a starting rating of 500. These players now play games (chess, or other head-to-head games) against each other. Players trade ratings based on the game’s outcome at the end of every game. If Jack and Jill play each other and Jill wins, she gains some rating points and Jack loses some rating points. This trade of points is scaled based on their rating difference at the start of the match. Let us say Jack is rated 1000 and Jill is rated 1200. Given Jill is rated higher we expect her to win and if she does she will gain a modest amount of rating, specifically she will gain 4.8 Elo points.[^jill-wins] Consequently, Jack will lose 4.8 Elo points. However, if Jack wins he would gain 15.2 Elo points[^jack-wins] and Jill would lose that same amount. Jack outperformed his expected skill level so he gets rewarded. Jill underperformed and got punished. Over time strong players gain rating points, weak players lose rating points, and settle close to their actual relative strengths.

Because the Elo rating system rates players’ comparative strengths, it can be used to calculate a player’s expected score. The formula for this expected score is below:

$$
E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}
$$

$E_A$ is the probability of player A winning. $R_A$ is the rating of player A and $R_B$ is the rating of player B. If you know the rating of both players, you can use this equation to determine the probability of each player winning. What’s important here is the number 400 in the denominator. This number was chosen deliberately so that every 400-point difference in rating would result in the stronger player being 10 times more likely to win.[^why-400] If the rating difference is 400, the strong player will be 10x as likely to win. If the rating difference is 800 the stronger player will be 100x more likely to win. Yes, 100x, not 20x, because each 400 point increase results in a 10x probability of winning. This means it goes from 10 to 100 to a 1000 and so on for every 400 point increase. The graph below shows your probability of winning vs. the rating difference. As you can see, your chances of winning against a player whose rating is 1000 points or more higher is more or less zero.

```chart
type: line
caption: Your chance of winning, by how much higher (or lower) your opponent is rated.
x: { label: Opponent's rating minus yours }
y: { label: Chance of winning (%), min: 0, max: 100 }
series:
  - name: Chance of winning
    fn: 100 / (1 + 10^(x / 400))
    from: -1200
    to: 1200
```

This is where things get really interesting. This Elo rating system (or some modern variant) is used by all major chess organizations, including the International Chess Federation (FIDE) and chess.com. Magnus Carlsen is the top rated player with a blitz rating of 3413 (at time of writing - Oct 2026). My rating on the other hand is 1399. Magnus’ rating is about 2000 points higher than mine. This means, based on statistical probabilities underpinning the rating system, Magnus would win 100,000 games before I won one.[^magnus] For context, your lifetime odds of being hit by lightning are about 1 in 15,000. That means I’m more likely to be hit by lightning 7 times in my life before I beat Magnus.

Okay, now we know that Magnus Carlsen could beat me in chess while half-drunk, so what? I think we can learn general lessons about greatness in any field by understanding how the Elo system works. If we assume that the distribution of proficiency in any given sport or game is comparable to the distribution of proficiency at chess, we can extend our understanding further. This is a big assumption and might not be true, but I think it’s probably close enough and can lead to an interesting perspective. In essence, this means that if you look at any sport, the top performers have a 100,000x probability of winning against an everyday person who plays the sport as a hobby. If we take basketball, then LeBron James has a 100,000x probability of winning against the guy who plays basketball on the weekend with his friends. In other words, LeBron is 100,000 times better. We all know LeBron is better than the regular guy - but knowing exactly how much better can be difficult. Unlike chess, basketball doesn’t have an Elo system for individual players, and in fact it couldn’t because it’s a team sport. But using chess as a lens we can at least try to estimate how much better the greatest player of any sport is. To me this is a fascinating way of looking at things!

[^jill-wins]: Jill is player A (1200) and Jack is player B (1000). Her expected score is:

    $$
    \begin{aligned}
    E_A &= \frac{1}{1 + 10^{(1000 - 1200)/400}} \\
        &= \frac{1}{1 + 10^{-0.5}} \\
        &\approx 0.76
    \end{aligned}
    $$

    After a game, a player's rating changes by $K \times (S - E)$, where $S$ is the result (1 for a win, 0 for a loss) and $K$ sets how big the swings are. With $K = 20$, a win moves Jill up by $20 \times (1 - 0.76) \approx 4.8$ points.

[^jack-wins]: Jack's expected score is what's left over: $E_B = 1 - 0.76 = 0.24$. If he wins, he gains $20 \times (1 - 0.24) \approx 15.2$ points. The less a win was expected, the more it's worth.

[^why-400]: Divide one player's expected score by the other's and the formula simplifies to:

    $$
    \frac{E_A}{E_B} = 10^{(R_A - R_B)/400}
    $$

    So every 400 points of difference multiplies the stronger player's odds by 10. Arpad Elo didn't pick 400 out of thin air. He kept the old rating classes, which were 200 points wide, and set the scale so that a player one class higher, 200 points up, would score about 75% against the lower one. With 400 in the formula, a 200-point gap gives $1 / (1 + 10^{-0.5}) \approx 0.76$.

[^magnus]: Magnus is player A (3413) and I'm player B (1399), a gap of 2014 points. My expected score is:

    $$
    \begin{aligned}
    E_B &= \frac{1}{1 + 10^{(3413 - 1399)/400}} \\
        &= \frac{1}{1 + 10^{5.035}} \\
        &\approx \frac{1}{108{,}000}
    \end{aligned}
    $$

    That's one win in about 108,000 games. The lifetime odds of being struck by lightning in the US are about 1 in 15,300, and $108{,}000 / 15{,}300 \approx 7$.
