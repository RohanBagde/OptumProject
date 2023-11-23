package acc.optum.plugin.inbound.mappers

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.logger.OptumLoggerUtil
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.locale.DisplayKey
uses gw.pl.persistence.core.Bundle
uses gw.pl.util.csv.CSVUtil

/**
 * Class Creates Activity to process error file and updates payment record status to Failed
 */
class OptumErrorRecordProcessor {

  /**
   * Method creates activity with failed reason
   *
   * @param inboundRecord
   * @param bundle
   */
  public static function processOptumErrorRecord(inboundRecord : InboundRecord, bundle : Bundle) {
    try {
      var fileData = inboundRecord.Content.split(OptumConstants.REGEXP_RECON_SPLIT)
      // Retrieving Failed Record from database
      if (fileData.HasElements) {
        var failedRecord = Query.make(OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#PaymentID, Relop.Equals, fileData[0]).select().AtMostOneRow
        if (not(failedRecord == null)) {
          failedRecord = bundle.add(failedRecord)
          failedRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_FAILED
          var claimNumber = failedRecord.ClaimNumber
          //Retrieving a claim associated to failed payment to create activity
          var claim = Query.make(Claim).compare(Claim#ClaimNumber, Relop.Equals, claimNumber).select().AtMostOneRow
          OptumLoggerUtil.logDebugLevel("Payment failed to process for the claim with the reason : ${fileData[1]}", "getOptumErrorRecord()")
          if (not(claim == null)) {
            claim = bundle.add(claim)
            //retrieving activity pattern
            var aPattern = ActivityPattern.finder.getActivityPatternByCode(OptumConstants.GENERAL_REMINDER_CODE)
            var activity = claim.createActivityFromPattern(null, aPattern)
            activity.Priority = Priority.TC_HIGH
            activity.Subject = DisplayKey.get("Accelerator.Optum.ActivitySubject", failedRecord.FirstPayee, failedRecord.ReportableAmount)
            activity.Description = fileData[OptumConstants.ONE]
            if (not(claim.AssignedUser == null)) {
              activity.assignToClaimOwner()
            } else {
              activity.assignGroup(claim.AssignedGroup)
            }
          }
          OptumLoggerUtil.logInfoLevel("Payement Record status updated to: ${failedRecord.PaymentRecordStatus}, Amount: ${failedRecord.ReportableAmount}", "getOptumErrorRecord()")
        } else {
          throw new OptumException("No record found with PaymentID: ${fileData[OptumConstants.ZERO]}")//todo remove payment id value before package delivery
        }
      }
    } catch (e : OptumException) {
      OptumLoggerUtil.logErrorLevel("Processing Rejected File failed and activity is not triggered ${e.Message}", "getOptumErrorRecord()", :ex = e)
      throw e
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel("Processing Rejected File failed and activity is not triggered ${e.Message}", "getOptumErrorRecord()", :ex = e)
      throw e
    }
  }
}