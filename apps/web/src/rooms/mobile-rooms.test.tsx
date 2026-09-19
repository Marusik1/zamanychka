import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileRoomLobby } from './mobile-room-lobby.js';
import { MobileRooms } from './mobile-rooms.js';

describe('authoritative mobile rooms surfaces', () => {
  it('renders actual rooms, maps statuses, filters, and uses existing handlers', () => {
    const onCreateRoom = vi.fn();
    const onRefresh = vi.fn();
    const onOpenRoom = vi.fn();
    render(<MobileRooms rooms={[
      { roomId: 'wait', code: 'WAIT', status: 'WAITING', memberCount: 1, seatedCount: 1, readyCount: 0 },
      { roomId: 'play', code: 'PLAY', status: 'ACTIVE', memberCount: 2, seatedCount: 2, readyCount: 2 },
    ]} onCreateRoom={onCreateRoom} onRefresh={onRefresh} onOpenRoom={onOpenRoom} />);
    expect(screen.getByText('Ожидает игроков')).toBeVisible();
    expect(screen.getByText('Идёт матч')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ожидают' }));
    expect(screen.getByText('Комната WAIT')).toBeVisible();
    expect(screen.queryByText('Комната PLAY')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Играют' }));
    fireEvent.click(screen.getByRole('button', { name: /Комната PLAY/i }));
    fireEvent.click(screen.getByRole('button', { name: /Создать комнату/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Обновить список комнат' }));
    expect(onOpenRoom).toHaveBeenCalledWith('play');
    expect(onCreateRoom).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Новички|Любители|Профи|рейтинг/i)).not.toBeInTheDocument();
  });

  it('renders actual lobby seats and invokes lifecycle actions', () => {
    const primary = vi.fn();
    const leave = vi.fn();
    render(<MobileRoomLobby code="248C" status="WAITING" seats={[
      { seatIndex: 0, displayName: 'Player One', isSelf: true, ready: true },
      { seatIndex: 1, displayName: null },
      { seatIndex: 2, displayName: null },
      { seatIndex: 3, displayName: null },
    ]} primaryAction={{ label: 'Начать матч', onClick: primary }} secondaryActions={[{ label: 'Покинуть комнату', onClick: leave, destructive: true }]} onBack={vi.fn()} />);
    expect(screen.getByText('Player One (Вы)')).toBeVisible();
    expect(screen.getByText('Готов')).toBeVisible();
    expect(screen.getAllByText('Свободное место')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Начать матч' }));
    fireEvent.click(screen.getByRole('button', { name: 'Покинуть комнату' }));
    expect(primary).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
  });
});
