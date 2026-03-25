# 🎴 Multiplayer Texas Hold'em Poker Guide

## Overview
Multiplayer Texas Hold'em Poker has been implemented! Players can now create tables, invite others, and play together in real-time with proper betting mechanics.

## Files Created/Modified

### New Files
1. **`/utils/pokerTableManager.js`** - Core poker table management system
2. **Updated `/commands/fun/poker.js`** - Multiplayer prefix commands
3. **Updated `/slashCommands/fun/poker.js`** - Slash command info (directs to prefix)

### Key Features

## Game Flow

```
1. HOST creates a table: !poker host <bet>
2. Other players JOIN: !poker join <bet>
3. HOST starts game when ready
4. Players take TURNS (automatically rotates)
5. PREFLOP → FLOP → TURN → RIVER → SHOWDOWN
6. Winner takes the pot
```

## Commands

### Host a Table
```
!poker host 100        # Create table with 100 coin bet
!poker host 50         # Create table with 50 coin bet
```
**Only the host can start the game!**

### Join a Table
```
!poker join 100        # Join an available 100 coin table
!poker join 50         # Join an available 50 coin table
```
**Automatically finds a table with matching bet waiting for players**

### Check Status
```
!poker status          # See current game state, pot, players
```

### Take Action
```
!poker action fold                 # Fold current hand
!poker action check                # Check (only if no uncalled bet)
!poker action call                 # Call the current bet
!poker action bet 50               # Bet 50 coins
!poker action raise 150            # Raise to 150 coins
```

## Game Rules

### Blinds
- **Small Blind**: 50% of minimum bet (rounded down)
- **Big Blind**: Minimum bet amount
- Small blind and big blind automatically post before cards dealt

### Betting Rounds
1. **Preflop** - After hole cards dealt (2 per player)
2. **Flop** - After 3 community cards revealed
3. **Turn** - After 4th community card revealed
4. **River** - After 5th community card revealed
5. **Showdown** - Remaining players compare best 5-card hands

### Actions Each Player Can Take
- **Fold** - Give up hand immediately
- **Check** - Pass without betting (only if current bet is 0)
- **Call** - Match the current bet
- **Bet** - Start betting in the round
- **Raise** - Increase the bet

### Hand Rankings (Best to Worst)
- 🏆 **Royal Flush** (10-J-Q-K-A same suit) - Pays 10000x
- 🎴 **Straight Flush** (5 consecutive, same suit) - Pays 9000x
- 4️⃣ **Four of a Kind** - Pays 8000x
- 🏠 **Full House** (3 of a kind + pair) - Pays 7000x
- 🌊 **Flush** (5 cards, same suit) - Pays 6000x
- ➡️ **Straight** (5 consecutive cards) - Pays 5000x
- 3️⃣ **Three of a Kind** - Pays 4000x
- 👥 **Two Pair** - Pays 3000x
- 👤 **One Pair** - Pays 2000x
- 🎯 **High Card** - Pays 1000x

## Player Limits

- **Minimum players**: 2
- **Maximum players**: 6
- **Minimum bet**: 10 coins
- **All-in allowed**: Yes (player can bet all remaining chips)

## Pot Distribution

- **Winner takes entire pot**
- If only 1 player remains (others fold), they win immediately
- Multiple players reach showdown → Best hand wins

## Game Features

✅ **Full Blind System**
- Small blind and big blind positioned correctly
- Blind rotation each hand (button moves)

✅ **Real Betting**
- Players can bet, call, check, raise
- Pot automatically tracked
- All-in support (no more chips required)

✅ **Hand Evaluation**
- Evaluates all 5-card combinations from 7 cards (2 hole + 5 community)
- Correctly ranks all poker hands
- Handles edge cases (Ace-low straights)

✅ **Turn-Based**
- Only current player can act
- Automatic timeout (fold if no action in 30 seconds)
- Proper action order maintained

✅ **Visual Feedback**
- Color-coded updates (green=action, blue=showdown)
- Real-time game display
- Shows community cards, pot, active players

## Timing

- **Player action timeout**: 30 seconds per action
- **Table inactivity cleanup**: 5 minutes (auto-removes inactive tables)
- **Turn indicator**: Shows whose turn it is

## Economy Integration

- Bets automatically deducted from player balance
- Pot increase tracked accurately
- Winnings automatically added to balance
- Per-guild coin management

## Statistics

Games are tracked in `/gamestats` including:
- Poker wins/losses/ties
- Accessible via `/gamestats` command
- Can view personal record

## Example Game

```
User A: !poker host 100
User B: !poker join 100
[User A clicks "Start Game"]

PREFLOP:
User B (small blind): 50 coins
User A (big blind): 100 coins
User B: !poker action check
User A: !poker action check
Pot: 150 coins

FLOP (3 cards revealed):
User B: !poker action bet 100
User A: !poker action call 100
Pot: 350 coins

TURN (4th card revealed):
User B: !poker action check
User A: !poker action check
Pot: 350 coins

RIVER (5th card revealed):
User B: !poker action bet 150
User A: !poker action fold
Pot: 500 coins

🎉 User B wins 500 coins!
```

## Troubleshooting

**Q: Can't join a table?**
- Make sure you have enough coins for the bet
- Check if table is full (max 6 players)
- Try hosting your own table instead

**Q: Action timeout - auto-folded?**
- You have 30 seconds to act per turn
- Use `!poker action <type>` quickly
- Game continues without you if you don't act

**Q: Multiple tables with same bet?**
- System finds first available one
- You'll be added to that table
- If full, try again to find another

**Q: Want to leave a table?**
- Game must not have started
- Create a new game with a different bet amount
- Coins deducted only when game starts

---

**Status**: ✅ Fully Implemented and Ready to Use!

Commands automatically load on bot restart. Enjoy your multiplayer poker sessions!
