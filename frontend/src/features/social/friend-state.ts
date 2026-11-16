type FriendGraph = {
  friends: { user_id: string }[];
  incoming_requests: { id: string; user_id: string }[];
  outgoing_requests: { user_id: string }[];
};

export function friendRequestState(userId: string, graph: FriendGraph):
  | { state: 'friend' }
  | { state: 'incoming'; requestId: string }
  | { state: 'outgoing' }
  | { state: 'none' } {
  if (graph.friends.some((friend) => friend.user_id === userId)) return { state: 'friend' };
  const incoming = graph.incoming_requests.find((request) => request.user_id === userId);
  if (incoming) return { state: 'incoming', requestId: incoming.id };
  if (graph.outgoing_requests.some((request) => request.user_id === userId)) return { state: 'outgoing' };
  return { state: 'none' };
}
