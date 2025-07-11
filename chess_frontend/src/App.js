import React, { useState, useEffect } from 'react';
import './App.css';

// --- Constants ---
const BOARD_SIZE = 8;
const PIECE_SYMBOLS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
const PIECE_THEME = {
  w: { color: 'var(--bg-secondary)' }, // Light piece
  b: { color: 'var(--text-primary)' },  // Dark piece
};
const INITIAL_BOARD = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

// --- Utilities ---
function getPieceColor(piece) {
  if (!piece) return null;
  return /[A-Z]/.test(piece) ? 'w' : 'b';
}
function cloneBoard(board) {
  return board.map(row => row.slice());
}
function posEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
function algebraicFromPos([row,col]) {
  return String.fromCharCode('a'.charCodeAt(0) + col) + (8 - row);
}
// ========== Chess Logic (Minimal, Pure JS, No deps) ==========

// PUBLIC_INTERFACE
function getAllMoves(board, turn, castlingRights, enPassant) {
  // Returns all legal moves for the current turn [{from: [r,c], to: [r,c], ...}]
  // For speed & brevity, includes only the major rules and basic check detection (may miss some edge-cases).
  // FULL PRODUCTION LOGIC would require full move-gen with deep check legality. Here we implement enough for a working frontend demo.

  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const color = getPieceColor(piece);
      if ((turn === 'w' && color !== 'w') || (turn === 'b' && color !== 'b')) continue;
      moves.push(...legalMovesForPiece(board, [r, c], piece, turn, castlingRights, enPassant));
    }
  }
  // Remove illegal moves that leave own king in check
  return moves.filter(m => !wouldLeaveKingInCheck(board, m, turn, castlingRights, enPassant));
}
function wouldLeaveKingInCheck(board, move, turn, castlingRights, enPassant) {
  // Apply the move to a cloned board and check if own king is in check
  const newState = applyMove(
    { board: cloneBoard(board), turn, castlingRights, enPassant, halfmove: 0, fullmove: 1 },
    move);
  return inCheck(newState.board, turn, newState.castlingRights, newState.enPassant);
}
function applyMove(state, move) {
  // Returns new state with move applied. Does not promote; always promotes to queen.
  const { board, turn, castlingRights, enPassant } = state;
  let { from, to, promotion } = move;
  const source = board[from[0]][from[1]];
  const dest = board[to[0]][to[1]];
  const newBoard = cloneBoard(board);
  // Handle castling
  let newCastling = { ...castlingRights };
  if (source.toUpperCase() === 'K') {
    // Remove castling right for this color
    if (turn === 'w') { newCastling.wk = false; newCastling.wq = false; }
    else { newCastling.bk = false; newCastling.bq = false; }
    // Kingside
    if (from[0] === to[0] && Math.abs(from[1] - to[1]) === 2) {
      // Move the rook
      if (to[1] === 6) { // kingside
        newBoard[from[0]][5] = newBoard[from[0]][7];
        newBoard[from[0]][7] = null;
      } else { // queenside
        newBoard[from[0]][3] = newBoard[from[0]][0];
        newBoard[from[0]][0] = null;
      }
    }
  }
  if (source.toUpperCase() === 'R') {
    // Remove castling if rook moves
    if (turn === 'w') {
      if (from[0] === 7 && from[1] === 0) newCastling.wq = false;
      if (from[0] === 7 && from[1] === 7) newCastling.wk = false;
    } else {
      if (from[0] === 0 && from[1] === 0) newCastling.bq = false;
      if (from[0] === 0 && from[1] === 7) newCastling.bk = false;
    }
  }
  // Handle en passant
  let newEnPassant = null;
  if (source.toUpperCase() === 'P') {
    if (Math.abs(to[0] - from[0]) === 2) {
      const epRow = (from[0] + to[0]) / 2;
      newEnPassant = [epRow, from[1]];
    }
    // Actual ep capture
    if (to[1] !== from[1] && !dest) {
      newBoard[from[0]][to[1]] = null;
    }
  }
  // Move piece
  let newPiece = source;
  if (promotion && source.toUpperCase() === 'P' && (to[0] === 0 || to[0] === 7)) {
    newPiece = turn === 'w' ? 'Q' : 'q';
  }
  newBoard[to[0]][to[1]] = newPiece;
  newBoard[from[0]][from[1]] = null;

  // Flip turn
  return {
    board: newBoard,
    turn: turn === 'w' ? 'b' : 'w',
    castlingRights: newCastling,
    enPassant: newEnPassant,
    halfmove: (source.toUpperCase() === 'P' || dest) ? 0 : (state.halfmove || 0) + 1,
    fullmove: turn === 'b' ? (state.fullmove || 1) + 1 : (state.fullmove || 1),
  };
}
function legalMovesForPiece(board, from, piece, turn, castlingRights, enPassant) {
  // Returns an array of {from, to, [promotion]} moves for this piece
  const moves = [];
  const [r, c] = from;
  const color = getPieceColor(piece);
  const enemy = color === 'w' ? 'b' : 'w';
  if (['P','p'].includes(piece)) {
    // Pawn movement
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    // 1 square forward
    if (inBoard(r+dir, c) && !board[r+dir][c]) {
      // Promotion
      if ((color === 'w' && r+dir === 0) || (color === 'b' && r+dir === 7))
        moves.push({from, to:[r+dir, c], promotion:true});
      else
        moves.push({from, to:[r+dir, c]});
      // 2 squares from start
      if (r === startRow && !board[r+dir*2][c])
        moves.push({from, to:[r+dir*2, c]});
    }
    // Captures, including en passant
    for (let dc of [-1,1]) {
      const nr = r+dir, nc = c+dc;
      if (inBoard(nr, nc) && board[nr][nc] && getPieceColor(board[nr][nc]) === enemy) {
        if ((color === 'w' && nr === 0) || (color === 'b' && nr === 7))
          moves.push({from, to:[nr, nc], promotion:true});
        else
          moves.push({from, to:[nr, nc]});
      }
      // en passant
      if (enPassant && enPassant[0] === nr && enPassant[1] === nc)
        moves.push({from, to:[nr, nc]});
    }
  } else if (piece.toUpperCase() === 'N') {
    // Knight
    for (let [dr,dc] of [[-2,1],[-1,2],[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1]]) {
      const nr = r+dr, nc = c+dc;
      if (inBoard(nr,nc) && (!board[nr][nc] || getPieceColor(board[nr][nc]) === enemy))
        moves.push({from,to:[nr,nc]});
    }
  } else if (piece.toUpperCase() === 'B') {
    for (let [dr,dc] of [[-1,1],[1,1],[1,-1],[-1,-1]])
      slideAdd(board, moves, from, dr, dc, color, enemy);
  } else if (piece.toUpperCase() === 'R') {
    for (let [dr,dc] of [[0,1],[1,0],[0,-1],[-1,0]])
      slideAdd(board, moves, from, dr, dc, color, enemy);
  } else if (piece.toUpperCase() === 'Q') {
    for (let [dr,dc] of [[-1,1],[1,1],[1,-1],[-1,-1],[0,1],[1,0],[0,-1],[-1,0]])
      slideAdd(board, moves, from, dr, dc, color, enemy);
  } else if (piece.toUpperCase() === 'K') {
    for (let dr of [-1,0,1]) for (let dc of [-1,0,1]) {
      if (dr===0 && dc===0) continue;
      const nr = r+dr, nc = c+dc;
      if (inBoard(nr,nc) && (!board[nr][nc] || getPieceColor(board[nr][nc]) === enemy))
        moves.push({from,to:[nr,nc]});
    }
    // Castling
    if (color === 'w' && r===7 && c===4) {
      if (castlingRights.wk && !board[7][5] && !board[7][6])
        if (!squareAttacked(board, [7,4],'w',castlingRights) && !squareAttacked(board, [7,5],'w',castlingRights) && !squareAttacked(board, [7,6],'w',castlingRights))
          moves.push({from, to:[7,6]});
      if (castlingRights.wq && !board[7][3] && !board[7][2] && !board[7][1])
        if (!squareAttacked(board, [7,4],'w',castlingRights) && !squareAttacked(board, [7,3],'w',castlingRights) && !squareAttacked(board, [7,2],'w',castlingRights))
          moves.push({from, to:[7,2]});
    }
    if (color === 'b' && r===0 && c===4) {
      if (castlingRights.bk && !board[0][5] && !board[0][6])
        if (!squareAttacked(board, [0,4],'b',castlingRights) && !squareAttacked(board, [0,5],'b',castlingRights) && !squareAttacked(board, [0,6],'b',castlingRights))
          moves.push({from, to:[0,6]});
      if (castlingRights.bq && !board[0][3] && !board[0][2] && !board[0][1])
        if (!squareAttacked(board, [0,4],'b',castlingRights) && !squareAttacked(board, [0,3],'b',castlingRights) && !squareAttacked(board, [0,2],'b',castlingRights))
          moves.push({from, to:[0,2]});
    }
  }
  return moves;
}
function slideAdd(board, moves, from, dr, dc, color, enemy) {
  let [r,c] = from;
  while (true) {
    r += dr; c += dc;
    if (!inBoard(r,c)) break;
    if (!board[r][c]) moves.push({from, to:[r,c]});
    else if (getPieceColor(board[r][c]) === enemy) { moves.push({from, to:[r,c]}); break; }
    else break;
  }
}
function inBoard(r,c) { return r>=0 && r<8 && c>=0 && c<8; }
function findKing(board, color) {
  const target = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++)
    if (board[r][c] === target) return [r,c];
  return null;
}
function inCheck(board, color, castlingRights, enPassant) {
  const king = findKing(board, color);
  if (!king) return false;
  return squareAttacked(board, king, color, castlingRights);
}
function squareAttacked(board, square, color, castlingRights) {
  // Any enemy piece attacks this square?
  const enemy = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
    const piece = board[r][c];
    if (!piece) continue;
    if (getPieceColor(piece) !== enemy) continue;
    const pseudoMoves = legalMovesForPiece(board, [r,c], piece, enemy, castlingRights, null);
    if (pseudoMoves.some(m => posEqual(m.to, square))) return true;
  }
  return false;
}
function gameStatus(board, turn, castlingRights, enPassant, moveHistory, halfmove) {
  // Returns {status: 'inprogress'|'checkmate'|'stalemate'|'draw'|'check', winner?:'w'|'b'|undefined}
  // - Draw by fifty-move or threefold repetition is not implemented for brevity, except for stalemate.
  const moves = getAllMoves(board, turn, castlingRights, enPassant);
  if (moves.length === 0) {
    if (inCheck(board, turn, castlingRights, enPassant))
      return {status: 'checkmate', winner: turn==='w' ? 'b' : 'w'};
    else return {status: 'stalemate'};
  }
  if (inCheck(board, turn, castlingRights, enPassant))
    return {status: 'check'};
  if (halfmove >= 100) return {status: 'draw'}; // 50-move rule
  // Threefold repetition could be implemented here.
  return {status: 'inprogress'};
}
// -------- End Chess Logic ---------

// --- AI (Very Basic) ---
function randomAIMove(board, turn, castlingRights, enPassant) {
  const moves = getAllMoves(board, turn, castlingRights, enPassant);
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random()*moves.length)];
}

// PUBLIC_INTERFACE
function fenFromState(state) {
  const { board, turn, castlingRights, enPassant } = state;
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) empty++;
      else {
        if (empty) fen += empty;
        fen += p;
        empty = 0;
      }
    }
    if (empty) fen += empty;
    if (r !== 7) fen += '/';
  }
  let castle = '';
  if (castlingRights.wk) castle += 'K';
  if (castlingRights.wq) castle += 'Q';
  if (castlingRights.bk) castle += 'k';
  if (castlingRights.bq) castle += 'q';
  if (!castle) castle = '-';
  let ep = enPassant ? algebraicFromPos(enPassant) : '-';
  return `${fen} ${turn} ${castle} ${ep} 0 1`;
}

// --- Components ---

// PUBLIC_INTERFACE
function ChessBoard({ board, selected, legalMoves, onSelectSquare, lastMove, theme }) {
  return (
    <div className="chessboard">
      {board.map((row, r) =>
        <div className="board-row" key={r}>
          {row.map((piece, c) => {
            const idx = [r, c];
            const isSelected = selected && posEqual(selected, idx);
            const isLegal = legalMoves && legalMoves.find(m => posEqual(m.to, idx));
            const isMoveFrom = lastMove && posEqual(idx, lastMove.from);
            const isMoveTo = lastMove && posEqual(idx, lastMove.to);
            const cellColor = (r + c) % 2 === 0 ? 'light' : 'dark';
            return (
              <button
                key={c}
                className={`square ${cellColor}
                  ${isSelected ? "selected" : ""}
                  ${isLegal ? "legal" : ""}
                  ${isMoveFrom ? "last-move-from" : ""}
                  ${isMoveTo ? "last-move-to" : ""}`
                }
                style={{ aspectRatio: '1/1', minWidth: 0 }}
                onClick={() => onSelectSquare([r, c])}
                tabIndex={0}
                aria-label={`${algebraicFromPos([r,c])} ${piece ? piece : ''}`}
              >
                {piece ? (
                  <span className={`piece ${getPieceColor(piece) === 'w' ? 'w' : 'b'}`}>
                    {PIECE_SYMBOLS[piece]}
                  </span>
                ) : ''}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// PUBLIC_INTERFACE
function MoveHistory({ history, onUndo }) {
  return (
    <div className="move-history">
      <h3>Move History</h3>
      <ol>
        {history.map((m, idx) => (
          <li key={idx}>
            <span>{m.san || `${algebraicFromPos(m.from)}→${algebraicFromPos(m.to)}`}</span>
          </li>
        ))}
      </ol>
      {history.length > 0 && <button className="undo-btn" onClick={onUndo}>Undo Move</button>}
    </div>
  );
}

// PUBLIC_INTERFACE
function ModeSelector({ mode, setMode, playing, onRestart }) {
  return (
    <div className="mode-selector">
      <div>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === '2p'}
            onChange={() => setMode('2p')}
            disabled={playing}
          />
          2-Player
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'ai'}
            onChange={() => setMode('ai')}
            disabled={playing}
          />
          Play vs AI
        </label>
      </div>
      <button className="restart-btn" onClick={onRestart}>Restart</button>
    </div>
  );
}

// PUBLIC_INTERFACE
function StatusBar({ status, turn, winner }) {
  let msg = '';
  if (status === 'inprogress')
    msg = `Turn: ${turn === 'w' ? 'White' : 'Black'}`;
  else if (status === 'check')
    msg = `Check! ${turn === 'w' ? 'White' : 'Black'} to move`;
  else if (status === 'checkmate')
    msg = `Checkmate! ${winner === 'w' ? 'White' : 'Black'} wins.`;
  else if (status === 'stalemate')
    msg = 'Stalemate! Draw.';
  else if (status === 'draw')
    msg = 'Draw (50-move rule)';
  return (
    <div className={`status-bar ${status}`}>
      {msg}
    </div>
  );
}

// --- Main App Component ---
function initialState() {
  return {
    board: cloneBoard(INITIAL_BOARD),
    turn: 'w',
    castlingRights: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

// PUBLIC_INTERFACE
function App() {
  // ---- Application State ----
  const [theme, setTheme] = useState('light');
  const [mode, setMode] = useState('2p'); // "2p" or "ai"
  const [state, setState] = useState(initialState());
  const [selected, setSelected] = useState(null); // Board square [r,c]
  const [legalMoves, setLegalMoves] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]);
  const [lastMove, setLastMove] = useState(null);

  // Effect to apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Reset on mode switch or restart
  const handleRestart = () => {
    setState(initialState());
    setSelected(null);
    setMoveHistory([]);
    setLastMove(null);
    setLegalMoves([]);
  };

  // Legal moves for selected piece
  useEffect(() => {
    if (!selected) {
      setLegalMoves([]);
      return;
    }
    const piece = state.board[selected[0]][selected[1]];
    if (!piece) {
      setLegalMoves([]);
      return;
    }
    const color = getPieceColor(piece);
    if ((state.turn === 'w' && color !== 'w') || (state.turn === 'b' && color !== 'b')) {
      setLegalMoves([]);
      return;
    }
    setLegalMoves(
      legalMovesForPiece(
        state.board,
        selected,
        piece,
        state.turn,
        state.castlingRights,
        state.enPassant
      ).filter(m => !wouldLeaveKingInCheck(state.board, m, state.turn, state.castlingRights, state.enPassant))
    );
  }, [selected, state]);

  // AI move effect
  useEffect(() => {
    if (mode === 'ai' && state.turn === 'b' && gameStatus(state.board, state.turn, state.castlingRights, state.enPassant, moveHistory, state.halfmove).status === 'inprogress') {
      // Play strong minimal delay
      const timeout = setTimeout(() => {
        let move = randomAIMove(state.board, state.turn, state.castlingRights, state.enPassant);
        if (move) handleMove(move, true /* isAI */);
      }, 500);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line
  }, [state, mode]);

  // Board square click handler
  const onSelectSquare = (pos) => {
    const piece = state.board[pos[0]][pos[1]];
    // If already selected and clicked a legal square, make move
    if (selected) {
      const move = legalMoves.find(m => posEqual(m.to, pos));
      if (move) {
        handleMove(move);
        setSelected(null);
        return;
      }
      // Reselect if different own piece
      if (piece && getPieceColor(piece) === state.turn) {
        setSelected(pos);
        return;
      }
      // Deselect
      setSelected(null);
      return;
    }
    // If own piece, select
    if (piece && getPieceColor(piece) === state.turn)
      setSelected(pos);
  };

  // PUBLIC_INTERFACE
  function handleMove(move, isAI=false) {
    // Apply move and update game state
    const newState = applyMove(
      {
        board: state.board,
        turn: state.turn,
        castlingRights: state.castlingRights,
        enPassant: state.enPassant,
        halfmove: state.halfmove,
        fullmove: state.fullmove,
      },
      move
    );
    // Add SAN
    const san = makeSAN(state, move);
    setState(newState);
    setMoveHistory([...moveHistory, {...move, san}]);
    setLastMove(move);
    setSelected(null);
    setLegalMoves([]);
  }

  // PUBLIC_INTERFACE
  function handleUndo() {
    if (moveHistory.length === 0) return;
    if (mode === 'ai' && moveHistory.length >= 2) {
      // Undo both player and AI move
      setMoveHistory(moveHistory.slice(0, -2));
    } else {
      setMoveHistory(moveHistory.slice(0, -1));
    }
    // Restore the board state
    let replayState = initialState();
    for (let idx = 0; idx < (mode === 'ai' ? moveHistory.length-2 : moveHistory.length-1); idx++) {
      replayState = applyMove(replayState, moveHistory[idx]);
    }
    setState(replayState);
    setLastMove(null);
    setSelected(null);
    setLegalMoves([]);
  }

  // Update game state if moveHistory changes (undo/replay)
  useEffect(() => {
    if (moveHistory.length === 0) {
      setState(initialState());
      setLastMove(null);
      setSelected(null);
      setLegalMoves([]);
      return;
    }
    let replayState = initialState();
    moveHistory.forEach(m => {
      replayState = applyMove(replayState, m);
    });
    setState(replayState);
    setLastMove(moveHistory[moveHistory.length-1] || null);
    setSelected(null);
    setLegalMoves([]);
  // eslint-disable-next-line
  }, [moveHistory.length]);

  // Generate simple algebraic notation for move (for move history)
  function makeSAN(prevState, move) {
    const piece = prevState.board[move.from[0]][move.from[1]];
    const dest = prevState.board[move.to[0]][move.to[1]];
    const pieceLetter = piece.toUpperCase() === 'P' ? '' : piece.toUpperCase();
    const capture = dest ? 'x' : '';
    let toSquare = algebraicFromPos(move.to);
    return `${pieceLetter}${capture}${toSquare}${move.promotion ? '=Q' : ''}`;
  }

  // --- Chess status ---
  const statusObj = gameStatus(state.board, state.turn, state.castlingRights, state.enPassant, moveHistory, state.halfmove);
  const status = statusObj.status;

  return (
    <div className="App">
      <header className="App-header" style={{minHeight: '100vh'}}>
        <button
          className="theme-toggle"
          onClick={()=>setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
        <h1
          className="title"
          style={{
            marginBottom: 10,
            color: '#2e2e2e',
            textAlign: 'left',
            fontStyle: 'italic',
            textDecoration: 'underline',
            backgroundColor: 'rgba(206, 208, 98, 1)'
          }}
        >
          Chess Master Game
        </h1>
        <span className="subtitle" style={{ color: '#888'}}>A modern, minimal chess game</span>
        <ModeSelector mode={mode} setMode={setMode} playing={moveHistory.length > 0} onRestart={handleRestart}/>
        <StatusBar status={status} turn={state.turn} winner={statusObj.winner} />
        <div className="main-layout">
          <ChessBoard
            board={state.board}
            selected={selected}
            legalMoves={legalMoves}
            onSelectSquare={onSelectSquare}
            lastMove={lastMove}
            theme={theme}
          />
          <div className="sidebar">
            <MoveHistory history={moveHistory} onUndo={handleUndo} />
            <div className="fen-block" style={{marginTop: '1.5em'}}>
              <label style={{ fontSize: 12, color:'#777'}}>FEN</label>
              <div className="fen" style={{
                padding: '0.5em', fontSize: '0.95em', background:'#f8f9fa', border:'1px solid #eee',
                overflowX:'auto', borderRadius:4, maxWidth:210
              }}>{fenFromState(state)}</div>
            </div>
          </div>
        </div>
      </header>
      <footer style={{ marginTop: 20, padding: 10, fontSize: '0.92em', color:'#aaa'}}>
        Made with React · <a href="https://reactjs.org/" style={{color:'#61dafb'}} rel="noopener noreferrer" target="_blank">Learn React</a>
      </footer>
    </div>
  );
}

// --- Styles for chessboard etc ---
const root = document.documentElement;
root.style.setProperty('--primary', '#2e2e2e');
root.style.setProperty('--secondary', '#ffffff');
root.style.setProperty('--accent', '#ffc107');

export default App;
