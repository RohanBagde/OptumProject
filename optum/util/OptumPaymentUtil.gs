package acc.optum.util

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.runtimeproperties.OptumRuntimeProperties
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.locale.DisplayKey
uses gw.api.system.database.SequenceUtil
uses gw.api.util.DateUtil
uses gw.api.util.DisplayableException
uses gw.document.DocumentExistsException
uses gw.pl.persistence.core.Bundle
uses gw.plugin.Plugins
uses gw.plugin.document.IDocumentContentSource
uses gw.webservice.cc.cc1000.dto.DocumentDTO
uses jsonschema.acc.optum.document_details.v1_0.DocumentDetails

uses java.io.InputStream
uses java.text.SimpleDateFormat

/**
 * This class creates Payment records for checks which is in requesting status and all utility methods related to Optum integration
 */
class OptumPaymentUtil {
  private static var dateFormatWithSeconds = new SimpleDateFormat(OptumRuntimeProperties.OptumDateFormatWithSeconds)
  private static var dateFormatWithDateOnly = new SimpleDateFormat(OptumRuntimeProperties.OptumDateFormatWithDateOnly)

  /**
   * Method creates and save details  in OptumPaymentRecord Entity
   *
   * @param check Check
   */
  public static function createPaymentRecord(check : Check) {
    check.isTransferable()
    try {
      var paymentRecord = getOptumPaymentRecord(check.PublicID)
      var bundle = check.Bundle
      paymentRecord = new OptumPaymentRecord_Acc()
      paymentRecord = bundle.add(paymentRecord)
      paymentRecord.PaymentID = getPaymentID(check)
      paymentRecord.CheckPublicID = check.PublicID
      paymentRecord.ClaimNumber = check.Claim.ClaimNumber
      paymentRecord.ReportableAmount = check.ReportableAmount.Amount
      paymentRecord.PrimaryInsured = check.Claim.Policy.insured.DisplayName
      paymentRecord.PolicyNumber = check.Claim.Policy.PolicyNumber
      paymentRecord.PaymentCreateDate = check.CreateTime
      paymentRecord.PaymentRequestType = check.OptumForceAsCheck_Acc ? OptumConstants.PAYMENT_REQUEST_TYPE_CHECK : OptumConstants.PAYMENT_REQUEST_TYPE
      paymentRecord.FirstPayee = check.FirstPayee.Payee.DisplayName
      //looping through CheckPayees
      check.Payees.each(\checkPayee -> createOptumPayee(checkPayee, paymentRecord, bundle))
      if (paymentRecord.OptumPayees.hasMatch(\payee -> payee.PayeeType == ContactRole.TC_VENDOR) and paymentRecord.OptumPayees.Count == 1) {
        paymentRecord.IsPayeeEnrolled = OptumConstants.OPTUM_NO
      } else {
        paymentRecord.IsPayeeEnrolled = OptumConstants.OPTUM_YES
      }
      switch (check.OptumPreferredMailClass_Acc) {
        case OptumPreferredMailClass_Acc.TC_DEFAULTMAILMETHOD:
          paymentRecord.DocumentDistributionMethod = OptumConstants.DEFAULTMAILMETHOD
          break
        case OptumPreferredMailClass_Acc.TC_DEFAULTOVERNIGHTPRIORITY:
          paymentRecord.DocumentDistributionMethod = OptumConstants.DEFAULTOVERNIGHTPRIORITY
          break
        case OptumPreferredMailClass_Acc.TC_FEDEXTWODAYSDELIVERY:
          paymentRecord.DocumentDistributionMethod = OptumConstants.FEDEXTWODAYDELIVERY
          break
        case OptumPreferredMailClass_Acc.TC_FEDEXOVERNIGHT:
          paymentRecord.DocumentDistributionMethod = OptumConstants.FEDEXOVERNIGHT
          break
        default:
          paymentRecord.DocumentDistributionMethod = OptumConstants.PREFERRED_DOCUMENTATION_DISTRIBUTION_METHOD
      }
      if (not(check.Status == TransactionStatus.TC_REQUESTED)) {
        //After successful process Check is assumed as sent to external so updating status to requested
        check.acknowledgeSubmission()
        check.CheckNumber = generateCheckNumber()
        OptumLoggerUtil.logInfoLevel("Check Status updated to: ${check.Status} for Check", "createPaymentRecord()")
      }
      paymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_DRAFT
      OptumLoggerUtil.logInfoLevel("Payment Record status updated to : ${paymentRecord.PaymentRecordStatus}, Amount: ${paymentRecord.ReportableAmount}", "createPaymentRecord()")
      OptumLoggerUtil.logInfoLevel("PaymentID : ${paymentRecord.PaymentID} and ClaimNumber : ${paymentRecord.ClaimNumber}"
          , "createPaymentRecord()")//todo remove this line package delivery
    } catch (exception : Exception) {
      OptumLoggerUtil.logDebugLevel("Error  while creating OptumPayment record ${exception.Message}", "createPaymentRecord()")
      throw new OptumException("Error while creating OptumPayment record for check: ${check.PublicID} : ${exception.Message}")//todo remove this public id from logs
    }
  }

  /**
   * Method returns paymentID with TimeStamp
   *
   * @param check Check
   * @return String
   */
  private static function getPaymentID(check : Check) : String {
    //Optum accept certain length only
    var paymentID = "${check.PublicID}${OptumConstants.CHECK}${dateFormatWithSeconds.format(check.CreateTime)}"
    if (paymentID.length > OptumConstants.PAYMENTID_LENGTH) {
      return "${check.PublicID}${OptumConstants.CHECK}"
    }
    return paymentID
  }

  /**
   * Method returns payeeID with TimeStamp
   *
   * @param checkPayee
   * @return String
   */
  private static function getPartyID(checkPayee : CheckPayee) : String {
    var payeeCreateDate = dateFormatWithDateOnly.format(checkPayee.Payee.CreateTime)
    var partyID = "${checkPayee.ClaimContact.PublicID}${OptumConstants.HYPHEN}${payeeCreateDate}"
    if (partyID.length > OptumConstants.IDFIELDLNGTH) {
      return checkPayee.ClaimContact.PublicID
    }
    return partyID
  }

  /**
   * Adding optumPayee to OptumPaymentRecord
   *
   * @param checkPayee
   * @param paymentRecord
   * @param bundle
   * @return OptumPayee_Acc
   */

  private static function createOptumPayee(checkPayee : CheckPayee, paymentRecord : OptumPaymentRecord_Acc, bundle : Bundle) : OptumPayee_Acc {
    var optumPayee = new OptumPayee_Acc()
    optumPayee = bundle.add(optumPayee)
    optumPayee.OptumPaymentRecord = paymentRecord
    mapOptumPayee(checkPayee, optumPayee)
    paymentRecord.addToOptumPayees(optumPayee)
    return optumPayee
  }

  /**
   * Method maps the fields from CheckPayee to optumPayee
   *
   * @param checkPayee
   * @param OptumPayee
   * @param bundle
   * @return OptumPayee_Acc
   */
  private static function mapOptumPayee(checkPayee : CheckPayee, OptumPayee : OptumPayee_Acc) : OptumPayee_Acc {
    OptumPayee.PayeeName = checkPayee.Payee.DisplayName
    OptumPayee.PayeeType = checkPayee.PayeeType
    OptumPayee.AddressLine1 = checkPayee.Payee.PrimaryAddress.AddressLine1
    OptumPayee.AddressLine2 = checkPayee.Payee.PrimaryAddress.AddressLine2
    OptumPayee.AddressLine3 = checkPayee.Payee.PrimaryAddress.AddressLine3
    OptumPayee.City = checkPayee.Payee.PrimaryAddress.City
    OptumPayee.State = checkPayee.Payee.PrimaryAddress.State
    OptumPayee.Country = checkPayee.Payee.PrimaryAddress.Country
    OptumPayee.EmailAddress = checkPayee.Payee.EmailAddress1
    OptumPayee.ZipCode = checkPayee.Payee.PrimaryAddress.PostalCode
    if (checkPayee.Payee typeis Person) {
      OptumPayee.PhoneNumber = checkPayee.Payee.CellPhoneValue
      OptumPayee.PhoneType = OptumConstants.OPTUM_CELL
    }
    OptumPayee.PayeePublicID = getPartyID(checkPayee)
    OptumPayee.OptumPayeePublicID = checkPayee.PublicID
    OptumPayee.TaxIDNumber = checkPayee.Payee.TaxID
    OptumLoggerUtil.logDebugLevel("Payee Public ID with Time Stamp: ${OptumPayee.PayeePublicID} for Claim ${OptumPayee.OptumPaymentRecord.ClaimNumber}", "mapOptumPayee()") //todo Remove public id from logger while package delivery
    return OptumPayee
  }

  /**
   * Updates existing OptumPayees from UI, payment record status to draft
   *
   * @param check
   */
  public static function updateOptumPayees(check : Check) {
    var OptumPayee : OptumPayee_Acc
    gw.transaction.Transaction.runWithNewBundle(\bundle -> {
      check.Payees.each(\checkPayee -> {
        OptumPayee = Query.make(OptumPayee_Acc).compare(OptumPayee_Acc#OptumPayeePublicID, Relop.Equals, checkPayee.PublicID).select().AtMostOneRow
        if (not(OptumPayee == null)) {
          OptumPayee = bundle.add(OptumPayee)
          OptumPayee = mapOptumPayee(checkPayee, OptumPayee)
        }
      })
      if (not(OptumPayee == null)) {
        OptumPayee.OptumPaymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_DRAFT
        OptumLoggerUtil.logInfoLevel("Payment Record status updated to: ${OptumPayee.OptumPaymentRecord.PaymentRecordStatus} , Amount: ${OptumPayee.OptumPaymentRecord.ReportableAmount}", "updateOptumPayees()")
        OptumLoggerUtil.logInfoLevel("PaymentID : ${OptumPayee.OptumPaymentRecord.PaymentID} and ClaimNumber : ${OptumPayee.OptumPaymentRecord.ClaimNumber}"
            , "updateOptumPayees()")//todo remove this line in package delivery
      }
    })
  }

  /**
   * Gets Qualified roles for Optum Enrollment
   *
   * @param claimContact
   * @return boolean
   */
  public static function isEnrollmentNotSuccessful(claimContact : entity.ClaimContact) : Boolean {
    var isEligible = false
    var status = claimContact.OptumEnrollmentStatus_Acc == null or
        claimContact.OptumEnrollmentStatus_Acc == OptumEnrollmentStatus_Acc.TC_ERROR
        or claimContact.OptumEnrollmentStatus_Acc == OptumEnrollmentStatus_Acc.TC_FAILED

    isEligible = status and isOptumEligibleContactRole(claimContact) and claimContact.Contact typeis Person
    return isEligible
  }

  /**
   * Checks whether given Claim contact is eligible for Optum Enrollment or not
   *
   * @param claimContact
   * @return Boolean
   */
  public static function isEligibleForEnrollment(claimContact : ClaimContact) : Boolean {
    return isOptumEligibleContactRole(claimContact) and claimContact.Contact typeis Person and
        claimContact.Contact.EmailAddress1.HasContent and claimContact.Contact.CellPhone.HasContent
  }

  /**
   * Checks qualified Roles for Optum Enrollment
   *
   * @param claimContact
   * @return
   */
  public static function isOptumEligibleContactRole(claimContact : ClaimContact) : Boolean {
    return claimContact.Roles.hasMatch(\claimContactRole ->
        ContactRole.TF_OPTUMELIGIBLECONTACTROLES_ACC.getTypeKeys().contains(claimContactRole.Role))
  }

  /**
   * Verifies ClaimContact's Email Address and Phone
   *
   * @param claimContact
   */
  public static function verifyEmailAndPhone(claimContact : ClaimContact) {
    if (claimContact.Contact typeis Person and (not claimContact.Contact.EmailAddress1.HasContent and not claimContact.Contact.CellPhone.HasContent)) {
      throw new DisplayableException(DisplayKey.get("Accelerator.Optum.MissingRequiredFields", claimContact.DisplayName))
    }
    if (claimContact.Contact typeis Person and not(claimContact.Contact.CellPhone.HasContent)) {
      throw new DisplayableException(DisplayKey.get("Accelerator.Optum.CellPhoneNumberMissing", claimContact.DisplayName))
    }
    if (claimContact.Contact typeis Person and not(claimContact.Contact.EmailAddress1.HasContent)) {
      throw new DisplayableException(DisplayKey.get("Accelerator.Optum.EmailMissing", claimContact.DisplayName))
    }
  }

  /**
   * Method creates a Document and uploads to Claim
   *
   * @param optumDocumentDetails
   * @param claim
   * @param inputStream
   */
  public static function createDocument(optumDocumentDetails : DocumentDetails, claim : Claim, inputStream : InputStream) {
    var doc : Document
    var document : DocumentDTO
    if (optumDocumentDetails.TransactionID.HasContent and optumDocumentDetails.DocumentID.HasContent) {
      gw.transaction.Transaction.runWithNewBundle(\bundle -> {
        try {
          document = new DocumentDTO()
          switch (optumDocumentDetails.DocumentType) {
            case OptumConstants.TEXT:
              document.MimeType = OptumConstants.CONTENT_TYPETEXT
              break
            case OptumConstants.PDF:
              document.MimeType = OptumConstants.CONTENT_TYPEPDF
              break
            default:
              document.MimeType = OptumConstants.CONTENT_TYPEPDF
          }
          document.ClaimPublicID = claim.PublicID
          document.DocUID = optumDocumentDetails.DocumentID
          document.Name = optumDocumentDetails.DocumentName
          document.DMS = true
          document.Description = optumDocumentDetails.DocumentDescription
          document.Inbound = true
          document.Status = DocumentStatusType.TC_APPROVED
          document.DocumentIdentifier = optumDocumentDetails.DocumentID
          document.Recipient = OptumConstants.DOCUMENT_RECEIPIENT
          document.Section = DocumentSection.TC_CORRESPONDENCE
          document.SecurityType = DocumentSecurityType.TC_UNRESTRICTED
          document.Type = DocumentType.TC_OTHER
          doc = document.writeToNewEntityIn(bundle)
          OptumLoggerUtil.logDebugLevel("Starting Optum document creation Document Name : ${optumDocumentDetails.DocumentName}", "createDocument()")
          Plugins.get(IDocumentContentSource).addDocument(inputStream, doc)
          OptumLoggerUtil.logInfoLevel("Completed Optum document creation for Claim. Document name is : ${optumDocumentDetails.DocumentName}", "createDocument()")
        } catch (e : DocumentExistsException) {
          //Not throwing exception because other documents get created
          var errorMessage = "Error occured in Optum document creation for Document Name, Document already Exists : ${document.Name}"
          OptumLoggerUtil.logErrorLevel("${errorMessage} : ${e.Message}", "createDocument()", :ex = e)
        } catch (e : Exception) {
          var errorMessage = "Error occured in Optum document creation for Document Name : ${document.Name}"
          OptumLoggerUtil.logErrorLevel(errorMessage + e.Message, "createDocument()", :ex = e)
          throw e
        } finally {
          inputStream?.close()
        }
      })
    }
  }

  /**
   * Generates a sequence number to update check Number
   *
   * @return String
   */
  private static function generateCheckNumber() : String {
    return String.valueOf(SequenceUtil.next(OptumConstants.SEQUENCE, OptumConstants.CHECKNUMBER))
  }

  /**
   * Retrieve optum payment record based on check public id
   *
   * @param checkPublicID
   * @return
   */
  public static function getOptumPaymentRecord(checkPublicID : String) : OptumPaymentRecord_Acc {
    return Query.make(OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#CheckPublicID, Relop.Equals, checkPublicID).select().AtMostOneRow
  }

  /**
   * Method to update contact enrollment status to updated
   *
   * @param claimContact
   */
  public static function updateNotApplicableEnrollmentStatus(claimContact : ClaimContact) {
    if (not(claimContact.Contact typeis Person) or not OptumPaymentUtil.isOptumEligibleContactRole(claimContact)) {
      claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_NOTAPPLICABLE
    }
  }

  /**
   * Method to create history event for the claim
   *
   * @param claim
   * @param historyType
   * @param description
   */
  public static function createHistory(claim : Claim, historyType : HistoryType, description : String) {
    var history = new History()
    history.Type = historyType
    history.Description = description
    history.EventTimestamp = DateUtil.currentDate()
    history.User = User.util.CurrentUser
    claim.addToHistory(history)
  }
}


