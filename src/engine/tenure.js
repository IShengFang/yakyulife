/* 球隊年資與神主牌的純判斷，集中在這裡避免顯示、交易與結算各自解讀。 */
export function isMrTeamEligible(firstTeamSeasons,starSeasons){
  const firstTeam=Math.max(0,Number(firstTeamSeasons)||0),star=Math.max(0,Number(starSeasons)||0);
  /* 至少 15 個一軍球季；明星級球季只需達一軍年資的 2/3，不是要 15 個明星球季。 */
  return firstTeam>=15&&star>=Math.ceil(firstTeam*2/3);
}

export function hasActiveFranchise(state){
  return !!(state&&state.traits&&state.traits.franchise&&state.franchiseActive);
}
