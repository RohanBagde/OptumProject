package acc.optum.runtimeproperties


uses acc.optum.OptumConstants
uses gw.api.properties.RuntimePropertyRetriever

/**
 * Optum Runtime Properties Class
 */
class OptumRuntimeProperties {

  private static var _runtimePropertyRetriever = new RuntimePropertyRetriever(RuntimePropertyGroup.TC_OPTUM_ACC)

  /**
   * property gets the optum enrolment URL
   *
   * @return
   */
  public static property get OptumSendEnrolmentURL() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.SEND_ENROLLMENT_URL)
  }

  /**
   * property gets the download document URL
   *
   * @return
   */
  public static property get DownloadDocumentURL() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.DOWNLOAD_DOCUMENT_URL)
  }

  /**
   * property gets optum host
   *
   * @return
   */
  public static property get OptumHost() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.HOST_ENDPOINT)
  }

  /**
   * property gets the optum enrolment URL
   *
   * @return
   */
  public static property get OptumCancellationUrl() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.CANCELLATION_URL)
  }

  /**
   * property gets the optum enrolment URL
   *
   * @return
   */
  public static property get OptumTransactionIdUrl() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.TRANSACTIONID_URL)
  }

  /**
   * Property to get purge days
   * @return
   */
  public static property get NoOfDaysForOptumPurgeRecords() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.PURGE_RECORDS)
  }

  /**
   * Property to get the date format with date only
   * @return
   */
  public static property get OptumDateFormatWithDateOnly() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.DATE_FORMAT_WITH_DATE)
  }

  /**
   * Property to get Date with seconds
   * @return
   */
  public static property get OptumDateFormatWithSeconds() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.DATE_FORMAT_WITH_SECONDS)
  }

  /**
   * Property to get Optum date format
   * @return
   */
  public static property get OptumDateFormat() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.DATE_FORMAT)
  }

  /**
   * Property to get Optum date format
   * @return
   */
  public static property get OptumClientCode() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.CLIENT_CODE)
  }

  /**
   * Property to get Optum date format
   * @return
   */
  public static property get OptumBillingEntityCode() : String {
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.BILLING_ENTITY_CODE)
  }

  /**
   * Optum Payment id kept for testing purpose please remove while package delivery
   * @return
   */
  public static property get OptumPaymentID():String{
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.OPTUM_PAYMENTID)
  }

  /**
   * Funding account code used in enrollments
   * @return
   */
  public static property get FundingAccountCode():String{
    return _runtimePropertyRetriever.getStringProperty(OptumConstants.FUNDING_ACCOUNT_CODE)
  }
}