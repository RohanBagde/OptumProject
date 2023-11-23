package acc.optum.enhancement

/**
 * Enhancement for Claim to get Insured
 */
enhancement OptumClaimEnhancement : Claim {

  /**
   * Property to get the insured contact
   * @return
   */
  property get InsuredContact_Acc() : ClaimContact {
    return this.Contacts.firstWhere(\claimContact -> claimContact.Contact == this.Insured)
  }
}
