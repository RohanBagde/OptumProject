package acc.optum.integration

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumPaymentRecordDataValidationException
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.runtimeproperties.OptumRuntimeProperties
uses gw.api.database.IQueryBeanResult
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.locale.DisplayKey
uses gw.api.util.DateUtil
uses gw.pl.persistence.core.Bundle

uses java.text.DecimalFormat
uses java.text.SimpleDateFormat
uses acc.optum.OptumConstants


/**
 * Class generates OptumOutBoundFile which includes both claimant and vendor payment records
 */
class OptumOutBoundFileProcess {

  private static final var CONFIG = Query.make(OutboundFileConfig).compare(OutboundFileConfig#Name, Relop.Equals, OptumConstants.OUTBOUND_FILE_CONFIG_NAME).select().AtMostOneRow
  private var dateFormat = new SimpleDateFormat(OptumRuntimeProperties.OptumDateFormat)
  private var trailerDateFormat = new DecimalFormat(OptumConstants.TRAILER_COUNT_FORMAT)
  private var recordCount : int
  private var fileCreateDate = dateFormat.format(DateUtil.currentDate())
  private var party_Info_Record_Count = OptumConstants.ZERO
  private var payment_Info_Record_Count = OptumConstants.ZERO
  private var claim_Info_Record_Count = OptumConstants.ZERO

  /**
   * Parent Method creates file with payment records which are passed from batch process
   *
   * @param paymentRecords
   * @return int
   */
  public function createOutboundRecord(paymentRecords : IQueryBeanResult<OptumPaymentRecord_Acc>) : int {
    try {
      var canGenerateFile = paymentRecords?.hasMatch(\paymentRecord -> paymentRecord.OptumPayees?.allMatch(\payee -> isOptumPayeeValid(payee)))
      gw.transaction.Transaction.runWithNewBundle(\bundle -> {
        if (canGenerateFile) {
          OptumLoggerUtil.logDebugLevel("Started creating Outbound Record", "createOutboundBoundRecord()")
          var record = createOutboundRecord(bundle)
          var recordContent = new StringBuilder()
          //HR001
          createHeader(recordContent)
          paymentRecords.each(\paymentRecord -> {
            paymentRecord = bundle.add(paymentRecord)
            var allPayeesValid = paymentRecord.OptumPayees.allMatch(\OptumPayee -> isOptumPayeeValid(OptumPayee))
            if (allPayeesValid) {
              //VR001
              createPaymentRecord(recordContent, paymentRecord)
              payment_Info_Record_Count++
              paymentRecord.OptumPayees.each(\OptumPayee -> {
                //VR002
                createPartyRecord(recordContent, OptumPayee, paymentRecord)
                party_Info_Record_Count++
              })

              //VR003
              createClaimRecord(recordContent, paymentRecord)
              claim_Info_Record_Count++
              paymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_SUBMITTED
              OptumLoggerUtil.logDebugLevel("Payment record Status Updated to: ${paymentRecord.PaymentRecordStatus},  Amount: ${paymentRecord.ReportableAmount}", "createOutboundBoundRecord()")
            } else {
              paymentRecord.OptumPayees.where(\optumPayee -> not isOptumPayeeValid(optumPayee)).each(\optumPayee -> createActivity(optumPayee, bundle))
              paymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_ERROR
              OptumLoggerUtil.logDebugLevel("Payment record Status Updated to: ${paymentRecord.PaymentRecordStatus},  Amount: ${paymentRecord.ReportableAmount}", "createOutboundBoundRecord()")
            }
          })

          //Total Records
          recordCount = party_Info_Record_Count + payment_Info_Record_Count + claim_Info_Record_Count + OptumConstants.TRAILER_COUNT
          //Trailer
          getHeaderCount(recordContent)
          getPaymentCount(recordContent)
          getPartyCount(recordContent)
          getClaimCount(recordContent)
          getTrailerCount(recordContent)
          record.Content = recordContent.toString()
          record.Status = OutboundRecordStatus.TC_PENDING
          OptumLoggerUtil.logDebugLevel("Optum OutBound Record generated", "createOutboundBoundRecord()")
        } else {
          paymentRecords.each(\paymentRecord -> {
            paymentRecord.OptumPayees.where(\OptumPayee -> not isOptumPayeeValid(OptumPayee)).each(\optumPayee -> createActivity(optumPayee, bundle))
            paymentRecord = bundle.add(paymentRecord)
            paymentRecord.PaymentRecordStatus = OptumPaymentRecordStatus_Acc.TC_ERROR
            OptumLoggerUtil.logInfoLevel("Payment record Status Updated to: ${paymentRecord.PaymentRecordStatus},  Amount: ${paymentRecord.ReportableAmount} ", "createOutboundBoundRecord()")
          })
        }
      })
    } catch (ex : Exception) {
      var errorMessage = "Getting error while payment record creation for Optum ${ex.StackTraceAsString}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "createOutboundBoundRecord()", :ex = ex)
      throw new OptumPaymentRecordDataValidationException(errorMessage)
    }
    return payment_Info_Record_Count
  }

  /**
   * Method to create outbound record
   *
   * @param bundle
   * @return OutboundRecord
   */
  private function createOutboundRecord(bundle : Bundle) : OutboundRecord {
    OptumLoggerUtil.logDebugLevel("Creating Outbound bound record", "createOutboundRecord()")
    var record = new OutboundRecord(bundle)
    record.Config = CONFIG
    record.CreateDate = DateUtil.currentDate()
    return record
  }

  /**
   * Method creates Header
   *
   * @param header
   */
  private function createHeader(header : StringBuilder) {
    header.append(OptumConstants.HEADER)
    header.append(OptumConstants.DELIMITER)
    header.append(OptumConstants.ENTITY)
    header.append(OptumConstants.DELIMITER)
    header.append(OptumRuntimeProperties.OptumClientCode)
    header.append(OptumConstants.DELIMITER)
    header.append(OptumConstants.ONE)
    header.append(OptumConstants.DELIMITER)
    header.append(fileCreateDate)
    header.append(OptumConstants.DELIMITER)
    header.append(OptumConstants.VERSION)
    appendDelimiter(header, 3)
    header.append(OptumConstants.NEWLINE)
  }


  /**
   * Method maps payment record from Optum Payment Record entity
   *
   * @param payment
   * @param paymentRecord
   */
  private function createPaymentRecord(payment : StringBuilder, paymentRecord : OptumPaymentRecord_Acc) {
    var paymentCreateDate = dateFormat.format(paymentRecord.PaymentCreateDate)
    payment.append(OptumConstants.PAYMENT_RECORD_TYPE)
    payment.append(OptumConstants.DELIMITER)
    payment.append(paymentRecord.PaymentID)
    payment.append(OptumConstants.DELIMITER)
    payment.append(OptumRuntimeProperties.OptumClientCode)
    payment.append(OptumConstants.DELIMITER)
    payment.append(OptumConstants.PAYERID)
    payment.append(OptumConstants.DELIMITER)
    payment.append(paymentCreateDate)
    payment.append(OptumConstants.DELIMITER)
    payment.append(paymentRecord.ReportableAmount)
    payment.append(OptumConstants.DELIMITER)
    payment.append(OptumConstants.PAYMENT_CURRENCY)
    payment.append(OptumConstants.DELIMITER)
    payment.append(OptumConstants.REMIT_METHOD)
    payment.append(OptumConstants.DELIMITER)
    payment.append(paymentRecord.OptumPayees.Count)
    appendDelimiter(payment, 5)
    payment.append(paymentRecord.IsPayeeEnrolled)
    appendDelimiter(payment, 10)
    payment.append(OptumConstants.NEWLINE)
  }

  /**
   * Method maps party record from Optum payment record
   *
   * @param party
   * @param optumPayee
   * @param paymentRecord
   */
  private function createPartyRecord(party : StringBuilder, optumPayee : OptumPayee_Acc, paymentRecord : OptumPaymentRecord_Acc) {
    var addressLine2 = optumPayee.AddressLine2.HasContent ? optumPayee.AddressLine2 : OptumConstants.EMPTY_STRING
    var addressLine3 = optumPayee.AddressLine3.HasContent ? optumPayee.AddressLine3 : OptumConstants.EMPTY_STRING
    var emailAddress = optumPayee.EmailAddress.HasContent ? optumPayee.EmailAddress : OptumConstants.EMPTY_STRING
    var endorser : String
    var payeeType : String
    var taxID : String
    var taxIDNumber : String
    var phoneNumber : String
    var phoneType : String
    if (paymentRecord.FirstPayee == optumPayee.PayeeName and not(optumPayee.PayeeType == ContactRole.TC_VENDOR)) {
      endorser = OptumConstants.ENDORSER
    } else {
      endorser = OptumConstants.ENDORSER1
    }
    if (optumPayee.PayeeType == ContactRole.TC_VENDOR) {
      payeeType = OptumConstants.VENDOR
      taxIDNumber = optumPayee.TaxIDNumber
      taxID = OptumConstants.GOVERNMENT_ID_TYPE
      phoneNumber = OptumConstants.EMPTY_STRING
      emailAddress = OptumConstants.EMPTY_STRING
      phoneType = OptumConstants.EMPTY_STRING
    } else {
      payeeType = OptumConstants.CLAIMANT
      taxIDNumber = OptumConstants.EMPTY_STRING
      taxID = OptumConstants.EMPTY_STRING
      phoneNumber = optumPayee.PhoneNumber
      phoneType = optumPayee.PhoneType
    }
    party.append(OptumConstants.PARTY_RECORD_TYPE)
    party.append(OptumConstants.DELIMITER)
    party.append(paymentRecord.PaymentID)
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.PayeePublicID)
    appendDelimiter(party, 6)
    party.append(payeeType)
    party.append(OptumConstants.DELIMITER)
    party.append(paymentRecord.PaymentRequestType)
    party.append(OptumConstants.DELIMITER)
    party.append(endorser)
    party.append(OptumConstants.DELIMITER)
    party.append(OptumConstants.PAYEE)
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.PayeeName)
    party.append(OptumConstants.DELIMITER)
    if (paymentRecord.FirstPayee == optumPayee.PayeeName) {
      party.append(OptumConstants.DEFAULT_ADDRESS)
    } else {
      party.append(OptumConstants.DEFAULT_ADDRESS_MULTYPARY)
    }
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.AddressLine1)
    party.append(OptumConstants.DELIMITER)
    party.append(addressLine2)
    party.append(OptumConstants.DELIMITER)
    party.append(addressLine3)
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.City)
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.State.Code)
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.Country.Code)
    party.append(OptumConstants.DELIMITER)
    party.append(optumPayee.ZipCode)
    party.append(OptumConstants.DELIMITER)
    party.append(emailAddress)
    party.append(OptumConstants.DELIMITER)
    party.append(phoneNumber)
    party.append(OptumConstants.DELIMITER)
    party.append(phoneType)
    appendDelimiter(party, 4)
    party.append(taxIDNumber)
    party.append(OptumConstants.DELIMITER)
    party.append(taxID)
    appendDelimiter(party, 3)
    party.append(paymentRecord.DocumentDistributionMethod)
    appendDelimiter(party, 2)
    party.append(OptumConstants.NEWLINE)
  }

  /**
   * Method maps claim record from Optum Payment record entity
   *
   * @param claim
   * @param paymentRecord
   */
  private function createClaimRecord(claim : StringBuilder, paymentRecord : OptumPaymentRecord_Acc) {
    claim.append(OptumConstants.CLAIM_RECORD_TYPE)
    claim.append(OptumConstants.DELIMITER)
    claim.append(paymentRecord.PaymentID)
    claim.append(OptumConstants.DELIMITER)
    claim.append(paymentRecord.ClaimNumber)
    claim.append(OptumConstants.DELIMITER)
    claim.append(paymentRecord.PrimaryInsured)
    claim.append(OptumConstants.DELIMITER)
    claim.append(paymentRecord.PolicyNumber)
    claim.append(OptumConstants.DELIMITER)
    claim.append(OptumConstants.NEWLINE)
  }

  /**
   * Method appends header count details to trailer record
   *
   * @param trailer
   */
  private function getHeaderCount(trailer : StringBuilder) {
    trailer.append(OptumConstants.TRAILER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.HEADER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER_RECORD_COUNT[OptumConstants.ZERO])
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER_RECORD_COUNT[OptumConstants.ZERO])
    appendDelimiter(trailer, 2)
    trailer.append(OptumConstants.NEWLINE)
  }

  /**
   * Method appends payment records count to trailer record
   *
   * @param trailer
   */
  private function getPaymentCount(trailer : StringBuilder) {
    trailer.append(OptumConstants.TRAILER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.PAYMENT_RECORD_TYPE)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER_RECORD_COUNT[OptumConstants.ONE])
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(trailerDateFormat.format(payment_Info_Record_Count))
    appendDelimiter(trailer, 2)
    trailer.append(OptumConstants.NEWLINE)
  }

  /**
   * Method appends party record count to trailer record
   *
   * @param trailer
   */
  private function getPartyCount(trailer : StringBuilder) {
    trailer.append(OptumConstants.TRAILER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.PARTY_RECORD_TYPE)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER_RECORD_COUNT[OptumConstants.TWO])
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(trailerDateFormat.format(party_Info_Record_Count))
    appendDelimiter(trailer, 2)
    trailer.append(OptumConstants.NEWLINE)
  }

  /**
   * Method appends claim record count to trailer record
   *
   * @param trailer
   */
  private function getClaimCount(trailer : StringBuilder) {
    trailer.append(OptumConstants.TRAILER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.CLAIM_RECORD_TYPE)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER_RECORD_COUNT[OptumConstants.THREE])
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(trailerDateFormat.format(claim_Info_Record_Count))
    appendDelimiter(trailer, 2)
    trailer.append(OptumConstants.NEWLINE)
  }

  /**
   * Method appends total trailer record count
   *
   * @param trailer
   */
  private function getTrailerCount(trailer : StringBuilder) {
    trailer.append(OptumConstants.TRAILER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER)
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(OptumConstants.TRAILER_RECORD_COUNT[OptumConstants.FOUR])
    trailer.append(OptumConstants.DELIMITER)
    trailer.append(trailerDateFormat.format(recordCount))
    appendDelimiter(trailer, 2)
  }

  /**
   * Method to validate payee is valid or not
   *
   * @param optumPayee
   * @return Boolean
   */
  public static function isOptumPayeeValid(optumPayee : OptumPayee_Acc) : Boolean {
    var validPayeeData : boolean
    if (not(optumPayee.PayeeType == ContactRole.TC_VENDOR)) {
      validPayeeData = not(optumPayee.EmailAddress == null or optumPayee.PhoneNumber == null)
    } else {
      validPayeeData = not(optumPayee.TaxIDNumber == null)
    }
    return not(optumPayee.AddressLine1 == null or optumPayee.City == null or
        optumPayee.State.Code == null or optumPayee.ZipCode == null or
        optumPayee.Country.Code == null) and validPayeeData
  }


  /**
   * Creates an activity to Adjuster with missing fields description
   *
   * @param optumPayee
   * @param bundle
   */
  private function createActivity(optumPayee : OptumPayee_Acc, bundle : Bundle) {
    var claimNumber = optumPayee.OptumPaymentRecord.ClaimNumber
    var existingClaim = Query.make(Claim).compare(Claim#ClaimNumber, Equals, claimNumber).select().AtMostOneRow
    if (not(existingClaim == null)) {
      existingClaim = bundle.add(existingClaim)
      var email = optumPayee.EmailAddress
      var address = optumPayee.AddressLine1
      var phone = optumPayee.PhoneNumber
      var city = optumPayee.City
      var state = optumPayee.State.Code
      var zipcode = optumPayee.ZipCode
      var country = optumPayee.Country.Code
      var aPattern = ActivityPattern.finder.getActivityPatternByCode(OptumConstants.GENERAL_REMINDER_CODE)
      var activity = existingClaim.createActivityFromPattern(null, aPattern)
      activity.Priority = Priority.TC_HIGH
      activity.Subject = DisplayKey.get("Accelerator.Optum.Subject")
      if (optumPayee.PayeeType == ContactRole.TC_VENDOR) {
        var taxID = optumPayee.TaxIDNumber
        activity.Description = DisplayKey.get("Accelerator.Optum.ActivityDescription", optumPayee.PayeeName, address, city, state, zipcode, country, taxID)
      }
      if (not(optumPayee.PayeeType == ContactRole.TC_VENDOR)) {
        activity.Description = DisplayKey.get("Accelerator.Optum.ActivityDes", optumPayee.PayeeName, email, phone, address, city, state, zipcode, country)
      }

      if (not(existingClaim.AssignedUser == null)) {
        activity.assignToClaimOwner()
      } else {
        activity.assignGroup(existingClaim.AssignedGroup)
      }
    }
  }

  /**
   * Method appends delimiter to the string builder for specified times
   *
   * @param sBuilder
   * @param count
   */
  private function appendDelimiter(sBuilder : StringBuilder, count : int) {
    while (count > 0) {
      sBuilder.append(OptumConstants.DELIMITER)
      count--
    }
  }
}