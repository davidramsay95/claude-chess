import React, { useState, useEffect, useRef } from 'react';
import { GameManager, GameStateExport } from '../game/gameManager';
import { BridgeHandler } from '../game/bridge';
import { Board } from '../chess/board';
import { Move, Color } from '../chess/types';
import { PieceRenderer } from './PieceRenderer';
import '../styles/game.css';

type GamePhase = 'start' | 'playing' | 'ended';

export const ChessGame: React.FC = () => {
  const [gameManager] = useState(() => new GameManager());
  const [bridge] = useState(() => new BridgeHandler(gameManager));
  const [gamePhase, setGamePhase] = useState<GamePhase>('start');
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [playerColor, setPlayerColor] = useState<Color>('white');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'expert'>('medium');
  const [board, setBoard] = useState(gameManager.getBoard().getState());
  const [moveList, setMoveList] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState({ isCheck: false, isCheckmate: false, isStalemate: false, isDraw: false });
  const [thinking, setThinking] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../chess/worker.ts', import.meta.url), { type: 'module' });
    bridge.sendReady();
  }, [bridge]);

  const startGame = (color: Color, diff: 'easy' | 'medium' | 'hard' | 'expert') => {
    gameManager.startNewGame(color, diff);
    setPlayerColor(color);
    setDifficulty(diff);
    setBoard(gameManager.getBoard().getState());
    setGamePhase('playing');
    setSelectedSquare(null);
    setMoveList([]);

    if (color === 'black') {
      makeEngineMove();
    }
  };

  const makeEngineMove = () => {
    if (!workerRef.current) return;

    setThinking(true);
    workerRef.current.postMessage({
      type: 'init',
      fen: gameManager.getBoard().toFen(),
      difficulty,
    });

    const moveHandler = (event: MessageEvent) => {
      const { move, uci, error } = event.data;

      if (error) {
        console.error('Engine error:', error);
        setThinking(false);
        return;
      }

      if (move) {
        gameManager.getBoard().makeMove(move);
        setBoard(gameManager.getBoard().getState());
        setMoveList(gameManager.getMoveHistory());
        updateGameStatus();
        setThinking(false);
      }

      workerRef.current?.removeEventListener('message', moveHandler);
    };

    workerRef.current.addEventListener('message', moveHandler);
    workerRef.current.postMessage({ type: 'findMove' });
  };

  const handleSquareClick = (square: number) => {
    if (!gameManager.isPlayerTurn() || gamePhase !== 'playing' || thinking) return;

    if (selectedSquare === null) {
      const moves = gameManager.getLegalMoves().filter(m => m.from === square);
      if (moves.length > 0) {
        setSelectedSquare(square);
        setLegalMoves(moves);
      }
    } else if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalMoves([]);
    } else {
      const move = legalMoves.find(m => m.to === square);
      if (move) {
        if (move.promotion) {
          handlePromotion(move);
        } else {
          executeMove(move);
        }
      } else {
        setSelectedSquare(square);
        const moves = gameManager.getLegalMoves().filter(m => m.from === square);
        setLegalMoves(moves);
      }
    }
  };

  const handlePromotion = (move: Move) => {
    const promotions: Array<'Q' | 'R' | 'B' | 'N'> = ['Q', 'R', 'B', 'N'];
    const promotion = promotions[0];
    const fullMove = { ...move, promotion };
    executeMove(fullMove);
  };

  const executeMove = (move: Move) => {
    if (gameManager.makePlayerMove(move)) {
      setBoard(gameManager.getBoard().getState());
      setMoveList(gameManager.getMoveHistory());
      setSelectedSquare(null);
      setLegalMoves([]);
      updateGameStatus();

      if (gameManager.isGameEnded()) {
        setGamePhase('ended');
      } else {
        setTimeout(() => makeEngineMove(), 500);
      }
    }
  };

  const updateGameStatus = () => {
    const status = gameManager.getGameStatus();
    setGameStatus(status);

    if (status.isCheckmate || status.isStalemate || status.isDraw) {
      setGamePhase('ended');
    }
  };

  const handleUndo = () => {
    if (moveList.length === 0) return;
    gameManager.getPreviousPosition();
    setBoard(gameManager.getBoard().getState());
    setMoveList(gameManager.getMoveHistory());
    setSelectedSquare(null);
    setLegalMoves([]);
    updateGameStatus();
  };

  const handleResign = () => {
    gameManager.resign();
    setGamePhase('ended');
    updateGameStatus();
  };

  const exportGame = () => {
    const state = gameManager.exportGameState();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chess_game.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importGame = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target?.result as string) as GameStateExport;
        if (gameManager.importGameState(state)) {
          setBoard(gameManager.getBoard().getState());
          setMoveList(gameManager.getMoveHistory());
          setPlayerColor(state.playerColor);
          setDifficulty(state.difficulty);
          setGamePhase('playing');
          updateGameStatus();
        } else {
          alert('Invalid game state');
        }
      } catch (error) {
        alert('Error loading game: ' + String(error));
      }
    };
    reader.readAsText(file);
  };

  if (gamePhase === 'start') {
    return (
      <div className="start-screen">
        <h1>Chess</h1>
        <div className="start-options">
          <div>
            <h2>Play as</h2>
            <button className={playerColor === 'white' ? 'active' : ''} onClick={() => setPlayerColor('white')}>
              White
            </button>
            <button className={playerColor === 'black' ? 'active' : ''} onClick={() => setPlayerColor('black')}>
              Black
            </button>
          </div>
          <div>
            <h2>Difficulty</h2>
            {(['easy', 'medium', 'hard', 'expert'] as const).map(d => (
              <button
                key={d}
                className={difficulty === d ? 'active' : ''}
                onClick={() => setDifficulty(d)}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <button className="start-button" onClick={() => startGame(playerColor, difficulty)}>
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="board-container">
        <svg className="board" viewBox="0 0 8 8">
          {Array.from({ length: 64 }).map((_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isLight = (row + col) % 2 === 0;
            const isSelected = i === selectedSquare;
            const isLegal = legalMoves.some(m => m.to === i);

            return (
              <g key={i} className="square" onClick={() => handleSquareClick(i)}>
                <rect
                  x={col}
                  y={row}
                  width={1}
                  height={1}
                  className={`
                    square-fill
                    ${isLight ? 'light' : 'dark'}
                    ${isSelected ? 'selected' : ''}
                    ${isLegal ? 'legal-move' : ''}
                  `}
                />
              </g>
            );
          })}
          <PieceRenderer board={board} selectedSquare={selectedSquare} />
        </svg>
      </div>

      <div className="game-info">
        <div className="status">
          {thinking && <span>Engine thinking...</span>}
          {gameStatus.isCheck && !gameStatus.isCheckmate && <span className="check">Check!</span>}
          {gameStatus.isCheckmate && <span className="checkmate">Checkmate!</span>}
          {gameStatus.isStalemate && <span className="stalemate">Stalemate</span>}
          {gameStatus.isDraw && <span className="draw">Draw</span>}
        </div>

        <div className="move-list">
          <h3>Moves</h3>
          <div className="moves">
            {moveList.map((move, i) => (
              <span key={i} className={i % 2 === 0 ? 'white-move' : 'black-move'}>
                {i % 2 === 0 && <span className="move-number">{Math.floor(i / 2) + 1}. </span>}
                {move}
              </span>
            ))}
          </div>
        </div>

        <div className="controls">
          <button onClick={handleUndo} disabled={moveList.length === 0 || thinking}>
            Undo
          </button>
          <button onClick={handleResign} disabled={gamePhase !== 'playing' || thinking}>
            Resign
          </button>
          <button onClick={exportGame}>Export</button>
          <label>
            Import
            <input type="file" accept=".json" onChange={importGame} style={{ display: 'none' }} />
          </label>
        </div>

        {gamePhase === 'ended' && (
          <div className="game-over">
            <p>{gameManager.getEndReason()}</p>
            <button onClick={() => setGamePhase('start')}>New Game</button>
          </div>
        )}
      </div>
    </div>
  );
};
