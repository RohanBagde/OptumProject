package acc.optum.messaging

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.integration.OptumClient
uses acc.optum.util.OptumPaymentUtil
uses gw.api.locale.DisplayKey
uses gw.plugin.messaging.MessageTransport
uses acc.optum.logger.OptumLoggerUtil

uses java.net.ConnectException
uses java.util.concurrent.TimeoutException

/**
 * Class to send Enrollment Details to Optum and  creates Optum Payment record
 */
class OptumTransport implements MessageTransport {


  /**
   * Method sends Enrollment Details For Optum and creates payment record
   *
   * @param message
   * @param transformedPayload
   */
  override function send(message : Message, transformedPayload : String) {
    //Setting unique one time referenceid to identify message properly
    if (not message.SenderRefID.HasContent) {
      message.SenderRefID = message.PublicID
    }
    //This section doesn't call Optum but create records internally by following message transport approach
    if (message.MessageRoot typeis Check) {
      var check = message.MessageRoot
      if (check.Status == TransactionStatus.TC_REQUESTING) {
        OptumLoggerUtil.logDebugLevel("${message.EventName} Event Triggered", "send()")
        try {
          OptumLoggerUtil.logInfoLevel("Started creating payment record for the Claim", "send()")
          OptumPaymentUtil.createPaymentRecord(check)
          message.reportAck()
          OptumLoggerUtil.logInfoLevel("Payment record creation completed for the Claim", "send()")
        } catch (e : Exception) {
          processUnanticipatedException(message, e)
        }
      }
    } else if (transformedPayload.HasContent and (message.MessageRoot typeis Claim or message.MessageRoot typeis ClaimContact)) {
      var responseCode : int
      var claimContact : ClaimContact
      var eventName = message.EventName
      try {
        //Executes during FNOL process
        if (message.MessageRoot typeis Claim and eventName == Claim.CLAIMCHANGED_EVENT) {
          var claim = message.MessageRoot
          claimContact = claim.InsuredContact_Acc
          responseCode = OptumClient.sendEnrollmentDetails(transformedPayload)
        }
        //Executes during eligible contact added after claim creation
        if (message.MessageRoot typeis ClaimContact and eventName == ClaimContact.CLAIMCONTACTADDED_EVENT) {
          var assignclaimContact = message.MessageRoot
          if (OptumPaymentUtil.isOptumEligibleContactRole(assignclaimContact)) {
            claimContact = assignclaimContact
          }
          responseCode = OptumClient.sendEnrollmentDetails(transformedPayload)
        }
        if (OptumConstants.SUCCESS_CODE.contains(responseCode) or responseCode == OptumConstants.ALREADY_ENROLLED) {
          claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_REQUESTED
          OptumLoggerUtil.logInfoLevel("Enrollment Status Updated to ${claimContact.OptumEnrollmentStatus_Acc} for PayeeID :${claimContact.PublicID} for ClaimNumber :${claimContact.Claim.ClaimNumber}", "send()")//todo remove PublicID,ClaimNumber logger in production
          message.reportAck()
        }
      } catch (e : TimeoutException) {
        OptumLoggerUtil.logErrorLevel("TimeoutException occured during enrollment process: ${e.Message}", "send", :ex = e)
        claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_ERROR
        throw e
      } catch (e : ConnectException) {
        OptumLoggerUtil.logErrorLevel("ConnectException occured during enrollment process: ${e.Message}", "send()", :ex = e)
        claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_ERROR
        throw e
      } catch (e : OptumException) {
        processUnanticipatedEnrollmentException(claimContact, message, e)
      } catch (e : Exception) {
        processUnanticipatedEnrollmentException(claimContact   , message, e)
      }
    }
  }

  override function shutdown() {

  }

  override function suspend() {

  }

  override function resume() {

  }

  override property set DestinationID(i : int) {

  }


  private function processUnanticipatedException(message : Message, e : Exception) {
    var type = (typeof e).toString()
    OptumLoggerUtil.logErrorLevel("Optum payment creation failed from check. Message will not be retried. Error is: ${e.Message}", "processUnanticipatedException()", :ex = e)
    message.ErrorDescription = "Optum destination experienced an unanticipated error: ${type}"
    message.reportError()
  }

  private function processUnanticipatedEnrollmentException(claimContact : ClaimContact, message : Message, e : Exception) {
    claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_ERROR
    var type = (typeof e).toString()
    OptumLoggerUtil.logErrorLevel("Optum payment creation failed for check. Message will not be retried. Error is: ${e.Message}", "processUnanticipatedEnrollmentException()", :ex = e)
    message.ErrorDescription = "Optum destination experienced an unanticipated error: ${type}"
    message.reportError()
  }
}