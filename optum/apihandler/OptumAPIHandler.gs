package acc.optum.apihandler

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.integration.OptumClient
uses acc.optum.logger.OptumLoggerUtil
uses acc.  optum.util.OptumPaymentUtil
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.locale.DisplayKey
uses gw.api.rest.RequestContext
uses gw.api.util.DateUtil
uses gw.api.webservice.exception.RequiredFieldException
uses gw.document.DocumentExistsException
uses jsonschema.acc.optum.note.v1_0.CreateNote
uses jsonschema.acc.optum.notes_details.v1_0.NoteDetails
uses jsonschema.acc.optum.notify_document_details.v1_0.NotifyDocumentDetails
uses jsonschema.acc.optum.optum_enrollment.v1_0.EnrollmentDetails
uses jsonschema.acc.optum.optum_response.v1_0.OptumResponse
uses jsonschema.acc.optum.payment_update_details.v1_0.PaymentUpdates

/**
 * Handler class to update payment details, enrolment details and notify document details
 */
class OptumAPIHandler {

  /**
   * Method to update payment details
   *
   * @param requestContext
   * @return OptumResponse
   */
  public function updatePaymentDetails(requestContext : RequestContext) : OptumResponse {
    var optumResponse = new OptumResponse()
    var check : Check = null
    var optumPaymentUpdateDetails : PaymentUpdates = null
    try {
      if (requestContext.BodyAsString.HasContent) {
        optumPaymentUpdateDetails = PaymentUpdates.parse(requestContext.BodyAsString)
        if (not optumPaymentUpdateDetails.PaymentID.HasContent) {
          throw new RequiredFieldException("PaymentID is missing, PaymentID is a required field")
        }
        var optumPaymentRecord = Query.make(OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#PaymentID, Relop.Equals, optumPaymentUpdateDetails.PaymentID?.toLowerCase()).select().AtMostOneRow
        if (optumPaymentRecord == null) {
          throw new OptumException("No associated Optum payment record found with provided PaymentID")
        }
        check = Query.make(Check).compare(Check#PublicID, Relop.Equals, optumPaymentRecord.CheckPublicID).select().AtMostOneRow
        if (check == null) {
          throw new OptumException("No Check found with provided check public id")
        }
        if (not(check.Claim.ClaimNumber == optumPaymentUpdateDetails.ClaimNumber)) {
          throw new IllegalArgumentException("Provided PaymentID does not matching with provide claim details, please provide a valid PaymentID that match with Claim")
        }
        gw.transaction.Transaction.runWithNewBundle(\bundle -> {
          optumPaymentRecord = bundle.add(optumPaymentRecord)
          check = bundle.add(check)
          switch (optumPaymentUpdateDetails.Status) {
            case TransactionStatus.TC_PENDINGVOID:
              optumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_PENDINGVOID
              check.voidCheck()
              break
            case TransactionStatus.TC_PENDINGSTOP:
              optumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_PENDINGSTOP
              check.stopCheck()
              break
            case TransactionStatus.TC_VOIDED:
              optumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_VOIDED
              check.updateCheckStatus(null, null, TransactionStatus.TC_VOIDED)
              break
            case TransactionStatus.TC_STOPPED:
              optumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_STOPPED
              check.updateCheckStatus(null, null, TransactionStatus.TC_STOPPED)
              break
            case TransactionStatus.TC_ISSUED:
              optumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_ISSUED
              check.updateCheckStatus(null, DateUtil.currentDate().toCalendar(), TransactionStatus.TC_ISSUED)
              break
            case TransactionStatus.TC_CLEARED:
              optumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_CLEARED
              check.updateCheckStatus(null, null, TransactionStatus.TC_CLEARED)
              break
            default:
              throw new IllegalArgumentException("Invalid payment status ${optumPaymentUpdateDetails.Status}, please enter a valid payment status pendingstop, pendingvoid,voided, stopped, cleared or issued")
          }

          //Adding history and note with payment update
          var description = DisplayKey.get("Accelerator.Optum.CheckStatusUpdate", check.getOriginalValue(Check#Status), check.Status, check.GrossAmount)
          var claim = bundle.add(check.Claim)
          addHistoryAndNoteForClaim(claim, description, HistoryType.TC_PAYMENTTYPE_ACC, optumPaymentUpdateDetails.NoteDetails)
          OptumLoggerUtil.logDebugLevel("PaymentRecord Status updated  from ${optumPaymentRecord.getOriginalValue("PaymentRecordStatus")} to ${optumPaymentRecord.PaymentRecordStatus}", "updatePaymentDetails()")
          OptumLoggerUtil.logDebugLevel("Check Status updated from  ${check.getOriginalValue("Status")} to ${check.Status} ", "updatePaymentDetails()")
          optumResponse.Status = OptumConstants.SUCCESS
          optumResponse.Message = DisplayKey.get("Accelerator.Optum.SuccessfullyProcessed", check.Status, optumPaymentUpdateDetails.PaymentID)
        })
        return optumResponse
      }
    } catch (e : OptumException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} : ${optumResponse.Status}", "updatePaymentDetails()", :ex = e)
    } catch (e : RequiredFieldException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "updatePaymentDetails()", :ex = e)
    } catch (e : IllegalArgumentException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "updatePaymentDetails()", :ex = e)
    } catch (e : RuntimeException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = DisplayKey.get("Accelerator.Optum.NotValidCheckStatus", check.getOriginalValue("Status"), optumPaymentUpdateDetails.Status)
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "updatePaymentDetails()", :ex = e)
    } catch (e : Exception) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = DisplayKey.get("Accelerator.Optum.NotValidCheckStatus", check.getOriginalValue("Status"), optumPaymentUpdateDetails.Status)
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "updatePaymentDetails()", :ex = e)
    }
    return optumResponse
  }

  /**
   * Method to create Notes for a claim
   *
   * @param requestContext
   * @return OptumResponse
   */
  public function createNote(requestContext : RequestContext) : OptumResponse {
    var optumResponse = new OptumResponse()
    var claim : Claim = null
    var createNote : CreateNote = null
    try {
      if (requestContext.BodyAsString.HasContent) {
        createNote = CreateNote.parse(requestContext.BodyAsString)
        if (not createNote.ClaimNumber.HasContent) {
          throw new RequiredFieldException(DisplayKey.get("Accelerator.Optum.ClaimNumberMissing"))
        }
        claim = Query.make(Claim).compare(Claim#ClaimNumber, Relop.Equals, createNote.ClaimNumber).select().AtMostOneRow
        if (claim == null) {
          throw new OptumException("Claim not found for provided claim number")
        }
        var noteDetails = createNote.NoteDetails
        gw.transaction.Transaction.runWithNewBundle(\bundle -> {
          claim = bundle.add(claim)
          claim.addNote(noteDetails.Topic, noteDetails.Subject, noteDetails.Body)

        })
        OptumLoggerUtil.logDebugLevel("${optumResponse.Message} : ${optumResponse.Status}", "createNote()")
        optumResponse.Status = OptumConstants.SUCCESS
        optumResponse.Message = DisplayKey.get("Accelerator.Optum.CreatedNote", createNote.ClaimNumber)
        return optumResponse
      }
    } catch (e : OptumException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "createNote()", :ex = e)
    } catch (e : RequiredFieldException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "createNote()", :ex = e)
    } catch (e : Exception) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = DisplayKey.get("Accelerator.Optum.FailedNote", createNote.ClaimNumber)
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "createNote()", :ex = e)
    }
    return optumResponse
  }


  /**
   * Method to Updates Enrollment statuses
   *
   * @param requestContext
   * @return OptumResponse
   */
  public function updateEnrollmentDetails(requestContext : RequestContext) : OptumResponse {
    var optumResponse = new OptumResponse()
    var optumEnrollmentUpdateDetails : EnrollmentDetails = null
    try {
      if (requestContext.BodyAsString.HasContent) {
        optumEnrollmentUpdateDetails = EnrollmentDetails.parse(requestContext.BodyAsString)
        if (not optumEnrollmentUpdateDetails.PayeeID.HasContent) {
          throw new RequiredFieldException("PayeeID is missing, PayeeID is a required field")
        }
        var claimContact = Query.make(ClaimContact).compare(ClaimContact#PublicID, Relop.Equals, optumEnrollmentUpdateDetails.PayeeID?.toLowerCase()).select().AtMostOneRow
        if (claimContact == null) {
          throw new IllegalArgumentException("No Payee/ClaimContact exists for provided PayeeID")
        }
        if (not(claimContact.Claim.ClaimNumber == optumEnrollmentUpdateDetails.ClaimNumber)) {
          throw new IllegalArgumentException("Provided PayeeID does not belongs to Claim, please provide a valid PayeeID that belongs to Claim")
        }
        gw.transaction.Transaction.runWithNewBundle(\bundle -> {
          claimContact = bundle.add(claimContact)
          switch (optumEnrollmentUpdateDetails.Status) {
            case OptumEnrollmentStatus_Acc.TC_ENROLLED:
              claimContact.OptumEnrollmentStatus_Acc = typekey.OptumEnrollmentStatus_Acc.TC_ENROLLED
              break
            case OptumEnrollmentStatus_Acc.TC_FAILED:
              claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_FAILED
              break
            case OptumEnrollmentStatus_Acc.TC_INPROGRESS:
              claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_INPROGRESS
              break
            default:
              throw new IllegalArgumentException("Invalid Enrollment Status ${optumEnrollmentUpdateDetails.Status}, please provide a valid status inprogress, failed or enrolled")
          }

          //create note and history
          var description = DisplayKey.get("Accelerator.Optum.EnrollmentUpdates", claimContact.OptumEnrollmentStatus_Acc)
          var claim = bundle.add(claimContact.Claim)
          addHistoryAndNoteForClaim(claim, description, HistoryType.TC_OPTUMENROLLMENTUPDATES_ACC, optumEnrollmentUpdateDetails.NoteDetails)
          OptumLoggerUtil.logDebugLevel("Enrollment Status updated to ${claimContact.OptumEnrollmentStatus_Acc} for ${optumEnrollmentUpdateDetails.PayeeID} ", "updateEnrollmentDetails()")
          optumResponse.Status = OptumConstants.SUCCESS
          optumResponse.Message = DisplayKey.get("Accelerator.Optum.EnrollmentStatus.SuccessfullyUpdated", optumEnrollmentUpdateDetails.PayeeID)
        })
      }
    } catch (e : OptumException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} : ${optumResponse.Status}", "updateEnrollmentDetails()", :ex = e)
    } catch (e : RequiredFieldException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} : ${optumResponse.Status}", "updateEnrollmentDetails()", :ex = e)
    } catch (e : IllegalArgumentException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} : ${optumResponse.Status}", "updateEnrollmentDetails()", :ex = e)
    } catch (e : Exception) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} : ${optumResponse.Status}", "updateEnrollmentDetails()", :ex = e)
    }
    return optumResponse
  }

  /**
   * Method to add Note,History with Description to a Claim
   *
   * @param claim
   * @param description
   * @param historyType
   * @param noteDetails
   */
  public function addHistoryAndNoteForClaim(claim : Claim, description : String, historyType : HistoryType, noteDetails : NoteDetails) {
    OptumPaymentUtil.createHistory(claim, historyType, description)
    if (not(noteDetails == null)) {
      claim.addNote(noteDetails.Topic, noteDetails.Subject, noteDetails.Body)
    }
  }

  /**
   * Method to add Document to a claim
   *
   * @param requestContext
   * @return OptumResponse
   */
  public function notifyDocumentDetails(requestContext : RequestContext) : OptumResponse {
    var optumResponse = new OptumResponse()
    var notifyDocumentDetails : NotifyDocumentDetails = null
    try {
      if (requestContext.BodyAsString.HasContent) {
        notifyDocumentDetails = NotifyDocumentDetails.parse(requestContext.BodyAsString)
        if (not notifyDocumentDetails.PaymentID.HasContent) {
          throw new RequiredFieldException("PaymentID is missing, PaymentID is a required field")
        }
        var optumPaymentRecord = Query.make(OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#PaymentID, Relop.Equals, notifyDocumentDetails.PaymentID?.toLowerCase()).select().AtMostOneRow//todo tolowercase is not required
        if (optumPaymentRecord == null) {
          throw new OptumException("No associated Optum payment record found with provided PaymentID and claim number")
        }
        var claim = Query.make(Claim).compare(Claim#ClaimNumber, Relop.Equals, optumPaymentRecord.ClaimNumber).select().AtMostOneRow
        if (claim == null) {
          throw new OptumException("No associated Optum payment record found with provided PaymentID and claim number")
        }
        if (not(optumPaymentRecord.ClaimNumber == claim.ClaimNumber)) {
          throw new IllegalArgumentException("Provided PaymentID does not matching with Claim, please provide a valid PaymentID that match with Claim")
        }
        if(notifyDocumentDetails.DocumentDetails == null) {
          throw new IllegalArgumentException("Plase provide the document details to create document")
        }
        //if  all documents exist skipping process
        var associatedDocumentsExist = notifyDocumentDetails.DocumentDetails?.allMatch(\documentDetail -> isDocumentExist(documentDetail.DocumentID, claim.ClaimNumber))
        if (associatedDocumentsExist) {
          optumResponse.Status = OptumConstants.FAILED
          optumResponse.Message = DisplayKey.get("Accelerator.Optum.DocumentExists", notifyDocumentDetails.DocumentDetails*.DocumentID)
          OptumLoggerUtil.logDebugLevel("${optumResponse.Message} :${optumResponse.Status}", "notifyDocumentDetails()")
          return optumResponse
        }
        OptumClient.downloadDocuments(notifyDocumentDetails.DocumentDetails, claim)
        optumResponse.Status = OptumConstants.SUCCESS
        optumResponse.Message = DisplayKey.get("Accelerator.Optum.DocumentDownloaded", notifyDocumentDetails.DocumentDetails*.DocumentID)
        OptumLoggerUtil.logDebugLevel("${optumResponse.Message} : ${optumResponse.Status}", "notifyDocumentDetails()")
        return optumResponse
      }
    } catch (e : OptumException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "notifyDocumentDetails()", :ex = e)
    } catch (e : RequiredFieldException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "notifyDocumentDetails()", :ex = e)
    } catch (e : DocumentExistsException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "notifyDocumentDetails()", :ex = e)
    } catch (e : IllegalArgumentException) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "notifyDocumentDetails()", :ex = e)
    } catch (e : Exception) {
      optumResponse.Status = OptumConstants.FAILED
      optumResponse.Message = e.Message
      OptumLoggerUtil.logErrorLevel("${e.Message} :${optumResponse.Status}", "notifyDocumentDetails()", :ex = e)
    }
    return optumResponse
  }

  /**
   * Method check is document exists or not
   *
   * @param documentID
   * @param claimNumber
   * @return Boolean
   */
  private function isDocumentExist(documentID : String, claimNumber : String) : Boolean {
    var document = Query.make(Document).compare(Document#DocumentIdentifier, Relop.Equals, documentID).join(Document#Claim).compare(Claim#ClaimNumber, Relop.Equals, claimNumber).select().AtMostOneRow
    return not(document == null)
  }
}