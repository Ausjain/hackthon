(function exposeInteractionModel(root) {
  'use strict';

  function ensurePlaceState(place) {
    place.reactions = {
      like:Math.max(0, Number(place.reactions?.like) || 0),
      dislike:Math.max(0, Number(place.reactions?.dislike) || 0)
    };
    place.reactionClients = place.reactionClients && typeof place.reactionClients === 'object'
      ? place.reactionClients
      : {};
    place.comments = Array.isArray(place.comments) ? place.comments : [];
    return place;
  }

  function normalizeCommentText(text) {
    return String(text || '').trim().replace(/\s+/g, ' ');
  }

  function addComment(place, comment) {
    ensurePlaceState(place);
    const normalized = normalizeCommentText(comment.text);
    if (!normalized) return { ok:false, reason:'empty' };
    const duplicate = place.comments.some(item => {
      return item.clientId === comment.clientId && normalizeCommentText(item.text) === normalized;
    });
    if (duplicate) return { ok:false, reason:'duplicate' };
    place.comments.push({ ...comment, text:String(comment.text).trim() });
    return { ok:true };
  }

  function deleteOwnComment(place, commentId, clientId) {
    ensurePlaceState(place);
    const index = place.comments.findIndex(item => item.id === commentId && item.clientId === clientId);
    if (index < 0) return false;
    place.comments.splice(index, 1);
    return true;
  }

  function toggleReaction(place, clientId, nextReaction, cancelOnly = false) {
    ensurePlaceState(place);
    if (!['like', 'dislike'].includes(nextReaction)) return { changed:false, selected:null };
    const previous = place.reactionClients[clientId] || null;
    if (cancelOnly && previous !== nextReaction) return { changed:false, selected:previous };
    if (previous === nextReaction) {
      place.reactions[nextReaction] = Math.max(0, place.reactions[nextReaction] - 1);
      delete place.reactionClients[clientId];
      return { changed:true, selected:null };
    }
    if (previous) place.reactions[previous] = Math.max(0, place.reactions[previous] - 1);
    place.reactions[nextReaction] += 1;
    place.reactionClients[clientId] = nextReaction;
    return { changed:true, selected:nextReaction };
  }

  const api = { ensurePlaceState, normalizeCommentText, addComment, deleteOwnComment, toggleReaction };
  if (typeof window !== 'undefined') window.INTERACTION_MODEL = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
